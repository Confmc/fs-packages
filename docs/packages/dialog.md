# fs-dialog

Component-agnostic dialog stack with error middleware.

```bash
npm install @script-development/fs-dialog
```

**Peer dependencies:** `vue ^3.5.0`

## What It Does

`fs-dialog` manages a LIFO stack of modal dialogs. It handles stacking, backdrop behavior, scroll locking, and error capture. You provide your own Vue components — the service manages the lifecycle.

## Basic Usage

### 1. Create the Service

```typescript
import {createDialogService} from '@script-development/fs-dialog';

const dialog = createDialogService();
```

### 2. Mount the Container

```vue
<!-- App.vue -->
<template>
    <div id="app">
        <router-view />
        <dialog.DialogContainerComponent />
    </div>
</template>
```

### 3. Open Dialogs

```typescript
import ConfirmDialog from '@/components/ConfirmDialog.vue';

dialog.open(ConfirmDialog, {
    title: 'Delete user?',
    message: 'This action cannot be undone.',
    onConfirm: () => deleteUser(userId),
});
```

Props are type-checked against your component's definitions — same pattern as `fs-toast`.

## Stack Behavior

Dialogs are managed as a **LIFO stack** (last in, first out). Opening a new dialog pushes it on top of the stack:

```typescript
dialog.open(SettingsDialog, {/* ... */}); // stack: [Settings]
dialog.open(ConfirmDialog, {/* ... */}); // stack: [Settings, Confirm]

// Confirm is on top, Settings is behind it
```

Each dialog renders inside a native `<dialog>` element using `showModal()`, which provides:

- **Backdrop** — clicking outside the topmost dialog is detected
- **Scroll lock** — body scrolling is disabled while dialogs are open
- **Focus trapping** — keyboard focus stays within the dialog
- **Escape** — closes the topmost dialog through the service (see [Escape](#escape))
- **Focus restore** — on close, focus returns to the element that opened the dialog (see [Focus](#focus))

## Closing Dialogs

### Close All

`closeAll()` clears the entire stack:

```typescript
dialog.closeAll();
```

### Close from Within

Your dialog component can close itself. A common pattern is to accept callback props:

```vue
<!-- ConfirmDialog.vue -->
<script setup lang="ts">
const props = defineProps<{title: string; message: string; onConfirm: () => void; onCancel: () => void}>();
</script>

<template>
    <div class="dialog">
        <h2>{{ title }}</h2>
        <p>{{ message }}</p>
        <button @click="onConfirm">Confirm</button>
        <button @click="onCancel">Cancel</button>
    </div>
</template>
```

```typescript
dialog.open(ConfirmDialog, {
    title: 'Delete?',
    message: 'This cannot be undone.',
    onConfirm: () => {
        deleteUser(userId);
        dialog.closeAll();
    },
    onCancel: () => dialog.closeAll(),
});
```

## Error Middleware

Errors thrown inside dialog components are caught via Vue's `onErrorCaptured`. You can register middleware to handle them:

```typescript
dialog.registerErrorMiddleware((error, {closeAll}) => {
    if (error instanceof ValidationError) {
        showValidationFeedback(error);
        return false; // stop propagation — error is handled
    }

    // return true to pass the error to the next middleware
    return true;
});
```

Multiple middleware handlers form a pipeline. Return `false` to stop propagation, `true` to pass the error to the next handler.

::: tip Combining with fs-http error middleware
A powerful pattern: register HTTP error middleware that opens an error dialog, and register dialog error middleware that handles errors within dialogs. The two systems compose naturally:

```typescript
// HTTP errors → open error dialog
http.registerResponseErrorMiddleware((error) => {
    if (error.response?.status === 403) {
        dialog.open(ForbiddenDialog, {message: 'Access denied'});
    }
});

// Errors inside dialogs → handle gracefully
dialog.registerErrorMiddleware((error, {closeAll}) => {
    console.error('Dialog error:', error);
    closeAll();
    return false;
});
```

:::

## Async Components

Dialog content is wrapped in `<Suspense>`, so you can use async setup in your dialog components:

```typescript
// Lazy-loaded dialog — only fetched when opened
dialog.open(
    defineAsyncComponent(() => import('@/components/HeavyDialog.vue')),
    {id: 42},
);
```

## v-model Synchronization

The service supports `v-model` prop updates — if your dialog emits `update:modelValue` events, the internal state stays in sync.

## Accessibility — Host ARIA Attributes

Native `<dialog>` elements need an accessible name (and usually a description) so screen readers announce more than a generic "dialog". `dialog.open()` accepts a third options arg that applies ARIA attributes directly to the host `<dialog>` element — your inner component does not need to walk `closest('dialog')` from a template ref.

```typescript
dialog.open(
    ConfirmDialog,
    {title: 'Delete user?', message: 'This action cannot be undone.'},
    {ariaLabelledBy: 'confirm-dialog-title', ariaDescribedBy: 'confirm-dialog-message'},
);
```

```vue
<!-- ConfirmDialog.vue — the ids match the host attributes above -->
<template>
    <div>
        <h2 id="confirm-dialog-title">{{ title }}</h2>
        <p id="confirm-dialog-message">{{ message }}</p>
    </div>
</template>
```

For dialogs without a visible title element, use `ariaLabel` instead:

```typescript
dialog.open(IconOnlyDialog, {/* … */}, {ariaLabel: 'Delete confirmation'});
```

All three options are independent and optional — pass any combination. Options omitted leave the corresponding attribute off the `<dialog>` element entirely (no empty-string attributes).

## Managing Backdrop Close Yourself

By default, clicking the backdrop closes the topmost dialog. When a dialog holds unsaved work, you may want to confirm before discarding — or otherwise decide for yourself whether a backdrop click should close. Pass `closeOnBackdropClick: false` and the service stops closing on backdrop clicks; closing is then entirely up to you via the injected `onClose`:

```typescript
dialog.open(EditForm, {/* props */}, {closeOnBackdropClick: false});
```

```vue
<!-- EditForm.vue — detect the backdrop click yourself, confirm, then close -->
<script setup lang="ts">
const props = defineProps<{onClose: () => void}>();

const onBackdrop = async (event: MouseEvent) => {
    if ((event.target as HTMLElement).tagName !== 'DIALOG') return;
    if (!isDirty.value || (await confirmDiscard())) props.onClose();
};
</script>
```

Pass a getter instead of a boolean and it is read at each click, so a dialog can refuse a backdrop close only while it is busy: `closeOnBackdropClick: () => !saving.value`.

The option only affects backdrop clicks. Programmatic closes (`closeAll()`, or `onClose` after a save) and Escape are unaffected — see `closeOnEscape` below for the Escape counterpart.

## Escape

Escape closes the topmost dialog, and only that one. The service cancels the browser's own close and closes through the same path as `onClose`, so the stack stays in step with what is on screen and focus is restored the same way as for every other close.

A dialog that must not be dismissed by Escape — unsaved work behind a dirty-confirm, say — passes `closeOnEscape: false` and decides for itself:

```typescript
dialog.open(EditForm, {/* props */}, {closeOnEscape: false, closeOnBackdropClick: false});
```

Both options also take a getter, read when the key press or click happens. A dialog that must stay open only while a request is in flight passes the same getter to both:

```typescript
const saving = ref(false);
const whileIdle = () => !saving.value;

dialog.open(EditForm, {/* props */}, {closeOnEscape: whileIdle, closeOnBackdropClick: whileIdle});
```

A refused Escape is not final. Chromium closes a dialog natively when Escape is pressed a second time with no click or key press in between, whatever the dialog asked for. The service follows that close: the dialog leaves the stack, scrolling unlocks and focus is restored, exactly as for any other close.

## Focus

When a dialog closes — by `onClose`, a backdrop click, Escape or `closeAll()` — focus goes back to the element that had focus when that dialog was opened. Stacked dialogs restore in LIFO order: closing the top dialog returns focus to the control inside the dialog below that opened it; closing a lower dialog (which closes everything above it too) returns focus to that lower dialog's opener. Focus moves after the dialog has left the DOM, since nothing outside an open modal can take focus.

When the opener can no longer take focus — the dialog's action removed it from the page, or it is disabled — pass `restoreFocusTo`. A getter is read at close time, so it can name an element that only exists after the action ran:

```typescript
dialog.open(
    ConfirmDelete,
    {onConfirm: () => removeRow(id)},
    {restoreFocusTo: () => document.querySelector<HTMLElement>('#rows-heading')},
);
```

A dialog can also be closed natively while a dialog opened from inside it stays open (something calls `close()` on the lower `<dialog>`). The dialog left open then carries the closed one's focus target behind its own opener and `restoreFocusTo`, so when it closes, focus still returns to where the chain was opened.

Without a usable opener, fallback or carried target, the service leaves focus where the browser put it.

## API Reference

### `createDialogService()`

Returns a dialog service. No parameters.

### Service Properties

| Property                           | Type                                                      | Description                  |
| ---------------------------------- | --------------------------------------------------------- | ---------------------------- |
| `open(component, props, options?)` | `(component, props, options?: DialogOpenOptions) => void` | Push a dialog onto the stack |
| `closeAll()`                       | `() => void`                                              | Clear the entire stack       |
| `registerErrorMiddleware(handler)` | `(handler) => UnregisterMiddleware`                       | Register an error handler    |
| `DialogContainerComponent`         | `Component`                                               | Mount this in your app root  |

### `DialogOpenOptions`

```typescript
interface DialogOpenOptions {
    ariaLabel?: string; // sets aria-label on the host <dialog>
    ariaLabelledBy?: string; // sets aria-labelledby on the host <dialog>
    ariaDescribedBy?: string; // sets aria-describedby on the host <dialog>
    closeOnBackdropClick?: boolean | (() => boolean); // default true; false (or a getter returning false, read at the click) to manage backdrop closing yourself
    closeOnEscape?: boolean | (() => boolean); // default true; false (or a getter returning false, read at the key press) to manage Escape yourself
    restoreFocusTo?: HTMLElement | null | (() => HTMLElement | null); // focus target when the opener cannot take focus back
}
```

### Error Handler Signature

```typescript
type DialogErrorHandler = (error: Error, context: {closeAll: () => void}) => boolean; // false = handled, true = pass to next handler
```
