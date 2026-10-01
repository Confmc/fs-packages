# @script-development/fs-dialog

## Unreleased

### Minor Changes

- **Escape now closes the topmost dialog (behaviour change, WR-1909).** Until now the service cancelled the native `cancel` event and did nothing else, so Escape never closed a dialog; that was a defect (Commander ruling 2026-10-01). The service still cancels the browser's own close — so the stack and the screen cannot disagree — and then closes the dialog through `onClose`. Consumers that relied on Escape doing nothing (BIO, codebook, emmie, isms, ublgenie) opt out per dialog with the new `closeOnEscape: false`.
- **Focus returns to the opener on close (WR-1909).** Every close path — `onClose`, backdrop click, Escape, `closeAll()` — returns focus to the element that was focused when that dialog opened, in LIFO order for stacked dialogs, after the dialog has left the DOM.
- **New `DialogOpenOptions.restoreFocusTo`** — an element, or a getter read at close time, focused when the opener has left the document or refuses focus (e.g. disabled). With neither, focus is left where the browser put it.
