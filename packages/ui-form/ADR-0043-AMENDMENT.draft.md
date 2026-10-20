# ADR-0043 amendment (draft): ui-form (2026-10-20)

Draft text for the amendment to ADR-0043 (Headless + Themeable Shared Vue UI Components). It follows the
ADR's own dated-section pattern ("Pilot outcome (…, 2026-07-16)"). Like `HANDOFF.md`, this file stays behind
when the package PR is made; the text goes to the ADR site.

---

## Amendment: ui-form (2026-10-20)

**Status:** Proposed. Built against emmie (two drawers, one fully and one in part, and a dialog-hosted modal;
vue-tsc and specs green, browser pass pending), 2026-10-19/20.

### What changes

1. **fs-form and ui-inputs merge into `@script-development/ui-form`.** Every form needs both the form state
   (the 422 binding, the submit guard, client refusals) and the controls, and the field's wiring (its id,
   `aria-describedby`, its message by name) sits exactly on the seam between them. As two packages, each
   consumer wired that seam by hand in every form. ui-form is a `ui-*` package that takes the form state in;
   it is not the "fold the controls into fs-form" option this ADR rejected, which would have put components in
   a service package.

2. **Errors.** Still error-as-prop at the control: every control takes `error`, and the mark is
   `invalid ?? Boolean(error)`. Added on top, a form-bound layer: `useForm` hands out bound controls and a
   `FormField` bound by name, wired by the form's own ids. A form takes only the 422 its own submit action
   rejects with; it registers nothing on an HTTP service. It recognises the 422 fs-http (axios) rejects with
   (`response.status` 422, `data.errors`); a territory on another client hands its errors over in that shape.
   Components still import no error service, and nothing is provided or injected. A form takes its ids from
   Vue's `useId()`, so it is built in a component's setup, or given a fixed `idPrefix` (a service, a spec).

3. **Styling: themeable with a default, no longer headless.** The `--ui-*` contract stays, and every visual
   rule still reads a token. The package now ships a concrete default look instead of neutral defaults, and
   every component rule sits in the `ui-form` cascade layer, so consumer CSS (utilities included) always wins.
   A territory with global element CSS (`input { … }`) puts it in a layer declared first, `@layer base, ui-form;`;
   unlayered, its element base beats the default look, which then looks broken.
   A territory that wants another look maps its tokens as before; one that likes the default sets nothing.

4. **fs-theme is not a peer dependency.** The ADR said the package peer-depends on `@script-development/fs-theme`
   for light/dark. Neither ui-inputs nor ui-form ever did: light/dark is orthogonal, and a consumer pairs
   fs-theme's `data-theme` with its token map if it wants that.

5. **fs-form and ui-inputs are deprecated** in favour of ui-form once ui-form is published (`npm deprecate`,
   a notice in both READMEs and docs pages), and then removed from the repo. Two copies of the same controls
   mean every fix lands twice, and the forced-colours fix of WR-1339 already had to be ported by hand.
   The removal follows ui-form's first publish: consumers pin their versions, so it changes nothing for them
   until they upgrade. ui-form runs next to both (its stylesheet also styles ui-inputs 0.17 markup), so a
   consumer migrates a page at a time (see Risks for why not a form at a time).

6. **Scope.** Number, Date and Textarea (the pilot's gaps) shipped in ui-inputs; ui-form adds Time, Search,
   Password and InputGroup (prepend/append). The date picker stays deferred; a consumer wires its own through
   the bound `FormField`.

7. **Typing as enforcement.** A bound control takes only a path of the draft it can read and whose type holds
   what the control writes, checked by vue-tsc, so a field that is never empty is typed honestly instead of
   widened to nullable. The package's typecheck also runs a declaration check, so a type the public surface
   names but does not export fails in the package, not in a consumer. Honest typing also surfaces dishonest
   models: an id stored as `0` for "none" needs the `FormDraft` escape hatch, and sending that `0` earns the
   user a wrong server message ("does not exist" instead of "required"), a bug class the types now show.

### Consequences

- **Positive:** one way to build a field (a bound control, or `<FormField name>` around your own control);
  messages land by the form's own ids, so scroll-to-error and `aria-describedby` cannot drift from the markup;
  one package to maintain instead of two overlapping ones.
- **Negative:** a breaking migration for fs-form and ui-inputs consumers (`useForm` takes no HTTP service, the
  select family's `label` becomes `optionLabel`, a form takes only its own action's 422); the CHANGELOG
  carries the migration table. Code that catches a 422 itself (a store, a composable) must rethrow it or
  pass it to `take()`, or the form never sees it: a cost per consumer, not only an API change. The default
  look is one territory's taste.
- **Risks:** while fs-form forms remain, fs-form's middleware on the shared HTTP service fills every mounted
  fs-form form on any 422, including one a ui-form form's save got; a ui-form modal over an fs-form page lights
  that page up. Migrate a page together with every dialog it opens. The form-bound layer is new API; it stays pre-1.0 until its build-tested consumer runs fully on
  it. Messages are keyed by path, index included, so a list whose rows move must `withdraw(path)` what was said
  about it.

### Graduation

Unchanged: ui-form graduates to its own repo via `git subtree split` if it grows into a full design system
with its own cadence.
