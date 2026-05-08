# @script-development/fs-toast

## 0.2.0

### Minor Changes

- Promote `ToastContainerComponent` to the browser top layer via the [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) so toasts remain visible above `<dialog>.showModal()` backdrops (closes [#71](https://github.com/script-development/fs-packages/issues/71)). The container declares `popover="manual"` and calls `.showPopover()` when the queue gains its first toast / `.hidePopover()` when the queue empties. The single-root container output from 0.1.1 is preserved — fallthrough class/style attributes still land on the root `<div>`.

### Migration — CSS Specificity

The UA stylesheet applies the following rules to any element with `[popover]:popover-open`:

```css
[popover]:popover-open {
    position: fixed;
    inset: 0;
    margin: auto;
    width: fit-content;
    height: fit-content;
}
```

The selector specificity is `(0,2,0)`. A consumer fallthrough class such as `.toast-stack { position: fixed; top: 1rem; right: 1rem }` (specificity `(0,1,0)`) does **not** override it. To restore custom positioning while a toast is queued, raise selector specificity by qualifying with `[popover]` or use `!important`:

```css
[popover].toast-stack {
    position: fixed;
    top: 1rem;
    right: 1rem;
    inset: auto;
    margin: 0;
    width: auto;
    height: auto;
}
```

`fs-toast` deliberately ships **no** inline `style` resets — inline style would block consumer overrides entirely. Override at the CSS layer instead.

### Browser Baseline

The Popover API requires Chrome ≥ 114, Firefox ≥ 125, Safari ≥ 17. Older browsers fall through the container's defensive try/catch — the toast queue still renders, just without top-layer promotion (and therefore without modal coexistence).

## 0.1.1

### Patch Changes

- Fix ToastContainerComponent rendering a fragment instead of a single root element. Vue drops fallthrough attributes on fragment components, so positioning classes applied directly on `<component :is="ToastContainerComponent" />` were silently lost. The container now wraps toasts in a `<div>`, enabling proper attribute inheritance.
