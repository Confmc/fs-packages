# @script-development/fs-dialog

## 0.5.0 — 2026-10-02

### Minor Changes

- **`closeOnEscape` and `closeOnBackdropClick` accept a getter (WR-1952).** Each takes `boolean | (() => boolean)`. A getter is read when the Escape or the backdrop click happens, not at `open()`, so a dialog can refuse to close only while a request is in flight. The boolean forms behave as before.
- **A dialog's `onClose` closes that dialog or nothing (WR-1914, consumer-visible).** `onClose` used to close by the stack index the dialog had at `open()`. A late `onClose` (for example, an async save resolving after the user had already closed the dialog) therefore closed whichever dialog had since taken that index. It now closes by the dialog's identity, so a stale `onClose` closes nothing. Closing a lower dialog still closes the ones above it, and calling `onClose` twice closes once.
- **A native close keeps the stack in sync (WR-1913).** In Chromium, a second Escape with no user activation in between closes a `closeOnEscape: false` dialog natively, whatever the service asked for. The same happens when anything calls `close()` on the element. The service did not listen for that, so the dialog left the screen but stayed on the stack, and the body stayed scroll-locked. It now follows the element's `close` event: that dialog leaves the stack, together with any dialog above it whose element has closed too. A dialog that is still open stays, including one opened between the close and its event (the browser delivers the event later). Scrolling unlocks once the stack is empty. Focus is restored at once when nothing remains above; otherwise the dialog left on top carries the closed dialog's focus target behind its own, so focus still returns to where the chain was opened when that dialog closes. A close the service made itself is not repeated.

## 0.4.0 — 2026-10-01

### Minor Changes

- **Escape now closes the topmost dialog (behaviour change, WR-1909).** Until now the service cancelled the native `cancel` event and did nothing else, so Escape never closed a dialog; that was a defect (Commander ruling 2026-10-01). The service still cancels the browser's own close — so the stack and the screen cannot disagree — and then closes the dialog through `onClose`. Consumers that relied on Escape doing nothing (BIO, codebook, emmie, isms, ublgenie) opt out per dialog with the new `closeOnEscape: false`.
- **Focus returns to the opener on close (WR-1909).** Every close path — `onClose`, backdrop click, Escape, `closeAll()` — returns focus to the element that was focused when that dialog opened, in LIFO order for stacked dialogs, after the dialog has left the DOM.
- **New `DialogOpenOptions.restoreFocusTo`** — an element, or a getter read at close time, focused when the opener has left the document or refuses focus (e.g. disabled). With neither, focus is left where the browser put it.
