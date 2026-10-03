# fs-form

Reactive form-submit helpers: a double-submit guard plus 422 validation-error binding for `fs-http` — from a single composable.

```bash
npm install @script-development/fs-form
```

**Peer dependencies:** `vue ^3.5.43`, `@script-development/fs-http ^0.5.0 || ^0.6.0`

## What It Does

`fs-form` is the extracted, shared version of a composable pair that two territories independently ran side-by-side. The one-call entry point is **`useForm`**, which wires both halves together:

- a reactive **field-error bag** populated from backend 422 responses (first message per field),
- a **`submitting`** flag that is the form's loading state (`true` while a submit is in flight),
- a validation-aware **`handleSubmit`** that prevents double-submit, clears prior errors, **swallows a 422** (the errors were already surfaced, so the populated form is preserved), and re-throws everything else.

The two building blocks — `useValidationErrors` and `useFormSubmit` — remain exported for the cases where you want one half without the other.

## Basic Usage

```vue
<script setup lang="ts">
import {useForm} from '@script-development/fs-form';

import {http} from '@/services';

type Field = 'name' | 'email';

const {errors, submitting, handleSubmit} = useForm<Field>(http);

const form = reactive({name: '', email: ''});

const submit = () =>
    handleSubmit(async () => {
        await http.postRequest('/users', form);
        // navigate away, toast success, etc.
    });
</script>

<template>
    <form @submit.prevent="submit">
        <input v-model="form.name" />
        <span v-if="errors.value.name">{{ errors.value.name }}</span>

        <input v-model="form.email" />
        <span v-if="errors.value.email">{{ errors.value.email }}</span>

        <button type="submit" :disabled="submitting.value">Save</button>
    </form>
</template>
```

One call, everything wired. On a 422 the field errors populate and `handleSubmit` swallows the rejection — the form (and its typed input) stays put. On any other failure the rejection propagates to your caller / async error boundary.

## Key Mapping

Laravel returns validation keys in the backend's casing (e.g. `first_name`). If your app addresses fields in camelCase, pass a per-key `(key: string) => string` converter:

```typescript
const camel = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

const {errors, submitting, handleSubmit} = useForm<Field>(http, {keyMapper: camel});
// backend `first_name` → bag key `firstName`
```

`keyMapper` defaults to identity — keys are used verbatim.

::: tip Why a keyMapper seam?
The two source territories diverged on exactly one axis: one camelCased the error keys, the other used them raw. `keyMapper` (default identity) is the single injection point that absorbs that divergence, so the package fits both without forking.
:::

## Fields, Refusals and Ownership

### Keep only the form's own fields

A 422 can name keys the form has no input for (a `token`, a field another screen owns). Pass `fields` to keep only the ones you can mark. It is matched against the **`keyMapper` output**, so list the names your form uses:

```typescript
const {errors, unmapped} = useForm<Field>(http, {keyMapper: camel, fields: ['name', 'email']});
// 422 {errors: {email: ['Taken'], token: ['Expired']}} → errors {email: 'Taken'}, unmapped ['token']
```

Omit `fields` and every key binds, as before.

### A refusal the form cannot mark

A 422 whose keys are all dropped leaves `errors` empty, and a screen that draws only `errors` then refuses in silence. Three readonly refs report the refusal itself:

| Ref              | Meaning                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `refused`        | A 422 was accepted since the last `clearErrors`                                                            |
| `unmapped`       | The mapped keys of that 422 that `errors` does not hold (not in `fields`, or not a string list), each once |
| `refusedUnnamed` | `refused` and `errors` is empty: show a form-level message                                                 |

`refused` is raised by the 422 middleware, at the moment the bag is written, not in `handleSubmit`'s catch. A store that catches and classifies the 422 itself, so `handleSubmit` sees a resolved action, still gets the signal. `clearErrors` resets all three, and `handleSubmit` calls it before each attempt. "The refusal named a key this form has no field for" is `unmapped.value.length > 0`.

### Take only your own submit's refusal

The middleware sees every 422 the shared `HttpService` answers, so a late 422 from a screen the user already left lands in the next mounted form's bag. `ownSubmitsOnly` takes a 422 only while this form's own `handleSubmit` is in flight:

```typescript
useForm<Field>(http, {ownSubmitsOnly: true});
```

It works because fs-http runs the middleware synchronously inside the axios interceptor, before the rejection reaches the awaiting action, so `submitting` is still `true` for the sender. **It cannot separate two submits in flight on one `HttpService` at once**: both are `submitting`, and each takes whichever 422 lands. Off by default. When wiring the primitives by hand, pass the predicate yourself: `useValidationErrors(http, {acceptWhen: () => submit.submitting.value})`.

## Scroll to the First Error

Pass `scrollToError` and a 422 scrolls the first invalid field into view, so the user lands on the first thing to fix. It targets the first `[aria-invalid="true"]` element and calls `scrollIntoView({block: 'center'})` after the mark is painted. It is **off by default**, and every example below has to opt in. `useForm` derives no ids and marks no fields itself, so it is also **inert unless the presentation layer marks the errored control** — `@script-development/ui-inputs` renders `aria-invalid` from `:invalid` out of the box.

```typescript
useForm<Field>(http); // no scroll — the default
useForm<Field>(http, {scrollToError: true, scrollRoot}); // opt in, scoped to your form
```

**Reduced motion is honoured.** The scroll is `behavior: 'smooth'`, except under `prefers-reduced-motion: reduce`, where it falls back to `'auto'` — a JS `scrollIntoView` behavior is not subject to the CSS media query, so it is checked explicitly.

**Marks with a class instead of `aria-invalid`?** Point `scrollTarget` at your own selector:

```typescript
useForm<Field>(http, {scrollToError: true, scrollTarget: '.field-error'});
```

### Forms that share a page

Without `scrollRoot` the query is **document-wide** — the first matching element in document order — which is right for a single form. When forms share a page, pass each form's root as `scrollRoot`:

```typescript
const formEl = ref<HTMLElement | null>(null);
useForm<Field>(http, {scrollToError: true, scrollRoot: formEl}); // scopes the scroll to formEl's subtree
```

`scrollRoot` is **required** for a dialog opened over a page form on the same `HttpService`. A 422 fills every such form's error bag (see [Scoping & Backend Contract](#scoping--backend-contract) below), so both forms mark their fields; a document-wide query then scrolls to whichever comes first in document order — often the _page's_ field, behind the backdrop, not the dialog's. Scope each form with `scrollRoot`, or give concurrently-mounted forms separate `HttpService` instances.

`useValidationErrors` never scrolls (the DOM-free primitive), and `useForm` does not either unless `scrollToError` is passed. A consumer that already scrolls on error simply leaves it off.

## Composing the Primitives

`useForm` is `useValidationErrors` + `useFormSubmit` wired together. Reach for the primitives directly when you want one half without the other — e.g. a validation-less confirm action needs the submit guard but no 422 middleware:

```typescript
import {useFormSubmit, useValidationErrors} from '@script-development/fs-form';

// submit guard only — no validation middleware registered
const {handleSubmit, submitting} = useFormSubmit({clearErrors: () => {}});

// or the two, wired by hand (exactly what useForm does internally)
const validation = useValidationErrors<Field>(http);
const {handleSubmit, submitting} = useFormSubmit(validation);
```

## Scoping & Backend Contract

**One error-scope per form.** `useValidationErrors` (and therefore `useForm`) registers a 422 observer on the `HttpService` you pass and keeps its own error bag. If two forms share **one** `HttpService` instance, a 422 from either fills **both** bags — cross-form bleed, with green types. `ownSubmitsOnly` closes this for a form that is not submitting; two forms submitting at once on one service still share the bleed. Give each form its own error scope where that matters: one form per `HttpService` instance, or don't share a service across concurrently-mounted forms.

**Laravel 422 contract.** `fs-form` targets **Laravel**'s validation-error response shape — `{ message?: string, errors: Record<string, string[]> }` — and binds the first message per field. A field whose value is not a list with a string first entry is **not bound**: it is left out of `errors` and listed in `unmapped` (before 0.3.0 a bare string bound its first character). An `errors` container that is not a plain object (an array, say) is read as no field map. If you point `fs-form` at a non-Laravel backend, revisit the parse in `useValidationErrors` first.

## Middleware Safety (Principle #8)

`useValidationErrors` wraps its response-error middleware body with `fs-http`'s `guarded()`. A throwing `keyMapper` — or any parse hiccup — is caught and surfaced loudly (via `guarded`'s default `console.error`) **without** rejecting a resolved request or masking the real API error. `refused` is raised before the parse, so such a 422 still reads as refused; `errors` and `unmapped` keep their previous values. `fs-form` is a compliant `fs-http` consumer out of the box per the [Middleware Sync Contract](../architecture#middleware-sync-contract).

## Cleanup

`useValidationErrors` (and therefore `useForm`) registers `onUnmounted(unregister)` for you, so a component-scoped instance cleans up its middleware automatically. Call it in a page's or component's `setup()`, never in a module-level store: outside a component, unmount cleanup does not fire and the middleware outlives every screen.

## API Reference

### `useForm(httpService, options?)`

The one-call entry point. Returns everything from both primitives.

| Parameter                | Type                       | Description                                                                                                                                                           |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `httpService`            | `HttpService`              | The `fs-http` service whose 422 responses to observe                                                                                                                  |
| `options.keyMapper`      | `(key: string) => string`  | Remaps raw backend field keys (default: identity)                                                                                                                     |
| `options.fields`         | `readonly T[]`             | Keep only these fields (by mapped name) in `errors`; others go to `unmapped` (default: every key)                                                                     |
| `options.ownSubmitsOnly` | `boolean`                  | Take a 422 only while this form's own `handleSubmit` is in flight (default: `false`; see [Take only your own submit's refusal](#take-only-your-own-submit-s-refusal)) |
| `options.scrollToError`  | `boolean`                  | Scroll the first invalid field into view on a 422 (default: `false`; pass `scrollRoot` with it — see [Scroll to the First Error](#scroll-to-the-first-error))         |
| `options.scrollRoot`     | `Ref<HTMLElement \| null>` | Scope the `scrollToError` query to a form's subtree; omit for document-wide (see [Scroll to the First Error](#scroll-to-the-first-error))                             |
| `options.scrollTarget`   | `string`                   | Selector for the invalid-field mark (default `[aria-invalid="true"]`); pass your own when inputs mark errors with a class                                             |

**Returns:**

| Property         | Type                                             | Description                                        |
| ---------------- | ------------------------------------------------ | -------------------------------------------------- |
| `errors`         | `Ref<ValidationErrors<T>>`                       | Reactive `Partial<Record<T, string>>` field bag    |
| `clearErrors()`  | `() => void`                                     | Empty the bag and reset the refusal                |
| `refused`        | `Readonly<Ref<boolean>>`                         | A 422 was accepted since the last clear            |
| `unmapped`       | `Readonly<Ref<readonly string[]>>`               | Mapped keys of that 422 not held in `errors`       |
| `refusedUnnamed` | `Readonly<Ref<boolean>>`                         | `refused` with an empty bag                        |
| `handleSubmit`   | `(action: () => Promise<void>) => Promise<void>` | Runs `action` with double-submit + 422-swallow     |
| `submitting`     | `Ref<boolean>`                                   | `true` while a submit is in flight (loading state) |

### `useValidationErrors(httpService, options?)`

Primitive: registers the 422 middleware and owns the error bag. Takes the same `httpService`, `keyMapper` and `fields`, plus `acceptWhen` (a `() => boolean` consulted on every 422; while it returns `false` the 422 is ignored), but **none of the scroll options** and not `ownSubmitsOnly`. Returns `{errors, clearErrors, refused, unmapped, refusedUnnamed}`.

### `useFormSubmit(validationErrors)`

Primitive: the submit guard. Takes anything exposing `clearErrors` (typically the `useValidationErrors` return); returns `{handleSubmit, submitting}`.
