# fs-form

Reactive form-submit helpers: a double-submit guard plus 422 validation-error binding for `fs-http`.

```bash
npm install @script-development/fs-form
```

**Peer dependencies:** `vue ^3.5.39`, `@script-development/fs-http ^0.5.0`

## What It Does

`fs-form` is the extracted, shared version of a composable pair that two territories independently ran side-by-side: `useValidationErrors` binds backend 422 field errors into a reactive bag, and `useFormSubmit` wraps a submit action with double-submit prevention and validation-aware error handling. The submit half is transport-agnostic (it wraps any `() => Promise<void>`); the validation half hooks `fs-http`'s response-error middleware.

The two are designed to work together but are independently useful:

- `useValidationErrors(httpService)` — registers a **422-only** response-error middleware that parses `{errors: {...}}` into a `Partial<Record<field, message>>` bag (first message per field) and unregisters automatically on unmount.
- `useFormSubmit(validationErrors)` — runs a submit action with a `submitting` flag, ignores re-entrant calls while in flight, clears prior errors before each attempt, **swallows a 422** (the field errors were already surfaced, so the populated form is preserved), and re-throws anything else.

## Basic Usage

```vue
<script setup lang="ts">
import {useFormSubmit, useValidationErrors} from '@script-development/fs-form';

import {http} from '@/services';

type Field = 'name' | 'email';

const validation = useValidationErrors<Field>(http);
const {handleSubmit, submitting} = useFormSubmit(validation);

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
        <span v-if="validation.errors.value.name">{{ validation.errors.value.name }}</span>

        <input v-model="form.email" />
        <span v-if="validation.errors.value.email">{{ validation.errors.value.email }}</span>

        <button type="submit" :disabled="submitting.value">Save</button>
    </form>
</template>
```

On a 422, `useValidationErrors`' middleware populates `validation.errors.value` and `handleSubmit` swallows the rejection — the form (and its typed input) stays put. On any other failure the rejection propagates to your caller / async error boundary.

## Key Mapping

Laravel returns validation keys in the backend's casing (e.g. `first_name`). If your app addresses fields in camelCase, pass a per-key `(key: string) => string` converter:

```typescript
const camel = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

const validation = useValidationErrors<Field>(http, {keyMapper: camel});
// backend `first_name` → bag key `firstName`
```

`keyMapper` defaults to identity — keys are used verbatim.

::: tip Why a keyMapper seam?
The two source territories diverged on exactly one axis: one camelCased the error keys, the other used them raw. `keyMapper` (default identity) is the single injection point that absorbs that divergence, so the package fits both without forking.
:::

## Middleware Safety (Principle #8)

`useValidationErrors` wraps its response-error middleware body with `fs-http`'s `guarded()`. A throwing `keyMapper` — or any parse hiccup — is caught and surfaced loudly (via `guarded`'s default `console.error`) **without** rejecting a resolved request or masking the real API error. `fs-form` is a compliant `fs-http` consumer out of the box per the [Middleware Sync Contract](../architecture#middleware-sync-contract).

## Cleanup

`useValidationErrors` registers `onUnmounted(unregister)` for you, so a component-scoped instance cleans up its middleware automatically. If you construct one **outside** a component setup, unmount cleanup does not fire — scope it to a component.

## API Reference

### `useValidationErrors(httpService, options?)`

| Parameter           | Type                      | Description                                            |
| ------------------- | ------------------------- | ------------------------------------------------------ |
| `httpService`       | `HttpService`             | The `fs-http` service whose error responses to observe |
| `options.keyMapper` | `(key: string) => string` | Remaps raw backend field keys (default: identity)      |

**Returns:**

| Property        | Type                       | Description                                     |
| --------------- | -------------------------- | ----------------------------------------------- |
| `errors`        | `Ref<ValidationErrors<T>>` | Reactive `Partial<Record<T, string>>` field bag |
| `clearErrors()` | `() => void`               | Empty the bag                                   |

### `useFormSubmit(validationErrors)`

| Parameter          | Type                        | Description                                                                  |
| ------------------ | --------------------------- | ---------------------------------------------------------------------------- |
| `validationErrors` | `{clearErrors: () => void}` | Anything exposing `clearErrors` — typically the `useValidationErrors` return |

**Returns:**

| Property       | Type                                             | Description                                    |
| -------------- | ------------------------------------------------ | ---------------------------------------------- |
| `handleSubmit` | `(action: () => Promise<void>) => Promise<void>` | Runs `action` with double-submit + 422-swallow |
| `submitting`   | `Ref<boolean>`                                   | `true` while an action is in flight            |
