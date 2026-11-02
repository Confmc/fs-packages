# ADR-0043 Amendment 2 (draft): the rules every ui-form control follows

Status: **draft, not sent.** Waiting on the reviewer's answers (sent on Mattermost 2026-11-02) to: app-wide defaults
through `createUiForm` (§ 6), whether he wants this amendment at all, and the placeholder question (§ 1, asked
separately). Points marked **[pending]** change with those answers; rewrite them before sending, never send them
marked pending. Shaped like Amendment 1. Form and kit rules (`field()`, the frame slot's `field`/`model`, client
refusals, bound controls) are deliberately left out: they are on fork branches only and get confirmed on landing.10
first; a later amendment carries them.

Before sending, re-check each "(#…)" reference against the PR's current head, and each emmie count against emmie's
pre-forms reference (development @ 4ad9f14077) and the shape review (`.experiment-packs/ui-form-reference/
shape-review.md`, emmie dev @ 912ca7f20e).

---

## Context

Amendment 1 set the architecture: one package, a control takes `invalid` while the field owns the message, no default
look, a control comes in because a consumer needs it. Reviewing the controls one PR at a time turned up rules that hold
for every control but are visible only in the PR where each first appeared, so in a single PR they read as a one-off
choice. A paper review of nine emmie templates checked them against a real consumer and counted what each costs it.

## Decision

1. **A control's surface.** `id` is required. `class` and `style` land on the control's root, every other attribute
   on the inner control. String controls emit `''` on clear (the backend's empty-string-to-null middleware maps it
   back); `NumberInput` and `TimeInput` emit `null`; `Checkbox` and `Switch` model a plain `boolean`.
   **[pending]** `placeholder` is optional; an app that wants every field to carry one enforces that itself. (The
   review comment on #328 was "mag wel required"; emmie works around the required prop with `placeholder=""` 34 times
   in 16 files. If the answer is "required", this sentence says so instead.)

2. **Clear buttons.** A clear button shows when a `clearLabel` resolves, from the call site or from the app's defaults
   (§ 6); it is also the button's accessible name, so there is no built-in English one. An empty `clearLabel` says the
   value must stay set. (#341, #342, #353 and the select branches)

3. **Buttons inside an input.** They are reachable by keyboard, show a focus ring and an outline in forced colours, are
   a 24px target at least, and a pointer press keeps focus in the field. A toggle keeps one name and carries its state
   in `aria-pressed`; a status notice is a live region that is always rendered, only its text changes. (#341, #342,
   #343)

4. **Options.** An option is any object with `id: string | number | boolean`; its shown text is `optionLabel` (a key or
   a getter). An option disables itself with `disabled` on the option: the groups honour it, the selects ignore it (no
   consumer disables a single select option). `alphabeticalSort` is opt-in: the caller's order is the default. A
   group's legend is its default slot over `label`. (#344, #353, the group and select branches)

5. **Looks are tokens.** No control takes a look prop (`small`, `size`, `variant`). A different look is a class on the
   control that sets `--ui-*` tokens, in the app's one token map; an app may wrap a control in its own component with
   its own props that set such a class. A look the tokens cannot express is a missing token: the package adds it with a
   neutral default. Component-scoped CSS on a control in an app is the sign that a token is missing, not the fix.
   A token that defaults to another is resolved where it is used (`var(--ui-x, var(--ui-base))`), never declared on
   `:root` as `var()`, so a base token set on one area reaches its focus, invalid and checked states. (#342; the
   token fix on `n-token-scope`)

6. **[pending] App defaults.** `createUiForm` sets an app's defaults once: its texts, `alphabeticalSort`, and a default
   `clearLabel` per control type. A prop at the call site overrides; `clear-label=""` opts one field out.

7. **A consumer's own controls.** The package ships controls any consumer would want in the same shape. A domain widget
   stays the consumer's and binds to a form through `field()`'s contract: `id`, `invalid`, `describedby`,
   `modelValue`, `onUpdate:modelValue`. A calendar date picker stays deferred (§ 6 of Amendment 1) until a second
   consumer needs one; emmie keeps its own pickers.

8. **Deprecation, interim.** fs-form follows ui-inputs' interim rule (Amendment 1 § 5 names only ui-inputs): frozen,
   fixes as patch releases, each fix carrying its ui-form port.

## Consequences

- **Positive:** one set of rules to review instead of one per PR; a consumer configures its house style once; a look
  scoped to one area works in every state; a consumer keeps its domain widgets and still binds them to a form.
- **Negative (emmie, pre-forms reference):** about 31 time and search fields (TimeInput 17, clearable unless
  `notNullable`; SearchInput 14, always clearable) keep a clear button only through an app default or a `clear-label`;
  selects stay sorted only through `alphabeticalSort: true`, set once (about 80 of ~100 selects sorted by default, 17
  opted out); `small` and `width-class` become classes; area looks move from `:deep()` CSS to tokens.
- **For the open point at first publish (Amendment 1 § 5):** a consumer using only form state (town-crier, fs-form
  only) that moves to ui-form would carry the kit's components, since `useForm` creates the bound controls. That argues
  for either a longer fs-form fix lane or a state-only entry point.

## Enforcement

| Rule | Level |
|---|---|
| Required props, value types, option shape | vue-tsc (props are typed; a missing `id` is a type error) |
| Token resolution (§ 5) | browser tests: a scoped base reaches derived tokens; every use carries its fallback; nothing frozen on `:root` |
| Clear buttons, in-input buttons, toggles | unit and browser tests per control |
| Looks as tokens, no look props | review |
