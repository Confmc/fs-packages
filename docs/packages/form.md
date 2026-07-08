# fs-form

Reactive form-submit helpers: a double-submit guard plus 422 validation-error binding for `fs-http` — from a single composable.

```bash
npm install @script-development/fs-form
```

**Peer dependencies:** `vue ^3.5.39`, `@script-development/fs-http ^0.5.0`

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

## Middleware Safety (Principle #8)

`useValidationErrors` wraps its response-error middleware body with `fs-http`'s `guarded()`. A throwing `keyMapper` — or any parse hiccup — is caught and surfaced loudly (via `guarded`'s default `console.error`) **without** rejecting a resolved request or masking the real API error. `fs-form` is a compliant `fs-http` consumer out of the box per the [Middleware Sync Contract](../architecture#middleware-sync-contract).

## Cleanup

`useValidationErrors` (and therefore `useForm`) registers `onUnmounted(unregister)` for you, so a component-scoped instance cleans up its middleware automatically. If you construct one **outside** a component setup, unmount cleanup does not fire — scope it to a component.

## API Reference

### `useForm(httpService, options?)`

The one-call entry point. Returns everything from both primitives.

| Parameter           | Type                      | Description                                          |
| ------------------- | ------------------------- | ---------------------------------------------------- |
| `httpService`       | `HttpService`             | The `fs-http` service whose 422 responses to observe |
| `options.keyMapper` | `(key: string) => string` | Remaps raw backend field keys (default: identity)    |

**Returns:**

| Property        | Type                                             | Description                                        |
| --------------- | ------------------------------------------------ | -------------------------------------------------- |
| `errors`        | `Ref<ValidationErrors<T>>`                       | Reactive `Partial<Record<T, string>>` field bag    |
| `clearErrors()` | `() => void`                                     | Empty the bag                                      |
| `handleSubmit`  | `(action: () => Promise<void>) => Promise<void>` | Runs `action` with double-submit + 422-swallow     |
| `submitting`    | `Ref<boolean>`                                   | `true` while a submit is in flight (loading state) |

### `useValidationErrors(httpService, options?)`

Primitive: registers the 422 middleware and owns the error bag. Same `httpService` / `options` as `useForm`; returns `{errors, clearErrors}`.

### `useFormSubmit(validationErrors)`

Primitive: the submit guard. Takes anything exposing `clearErrors` (typically the `useValidationErrors` return); returns `{handleSubmit, submitting}`.
