# Shape review: emmie templates against ui-form (paper, 2026-11-02)

**Read from:**
- emmie `origin/development` @ `912ca7f20e` (2026-11-02).
- This folder's README.md and controls-props.txt.
- The fork branches `n-form-kit`, `n-field-hint`, `n-field-aside`, `n-field-label-after`, `n-group-combobox`, and `styles.css` on `n-multi-combobox`.

Nothing was run: the findings are from reading the code. Every finding is tagged with the layer it rests on:

- **[CONTROL]** a control, settled in review or close to it;
- **[FORM]** `useForm` and its submit, refusals and field wiring (fork branches only);
- **[KIT]** the form-bound components (`form.FormField`, `form.TextField`; slice 5, being built);
- **[STYLE]** `styles.css`, its tokens and its layer.

emmie paths are relative to `frontend/apps/`.

## Ranked: the findings that would change the package's shape

1. **[STYLE] Area-wide token overrides only half apply.**
   - The derived tokens are declared on `:where(:root)` as `var()` of a base token: `--ui-control-bg-focus: var(--ui-control-bg)`, `--ui-check-bg: var(--ui-control-bg)`, `--ui-chip-bg`, and so on. A custom property's `var()` is resolved where it is declared and then inherited as a value. So when an area sets `.drawer-fields { --ui-control-bg: <surface> }`, the resting background changes, but focus, invalid, check and chip keep the root's white.
   - emmie has at least three field looks today, each scoped to an area:
     - the drawers (labels above, 40px, surface background; `ProductFormDrawer.vue`, `ProductVersionDrawer.vue`, `DrawerFormField.vue`);
     - the modal and page rows (horizontal);
     - the auth card (`auth/AuthLayout.vue`, 40px, 12px radius, its own focus ring, iOS 16px floor).

     Each is done with `:deep()` CSS on native elements now. The package's own answer, tokens and not scoped styles, works for these only if a token can be set on an area.
   - **Needs:** derive at the point of use (`var(--ui-control-bg-focus, var(--ui-control-bg))`), or declare the derived defaults on the controls' own classes instead of `:root`, so they resolve at the element.
   - Cheap now, a breaking change later.
2. **[FORM/KIT] One control for two field names.**
   - `user/domains/client/tabs/presence/components/VacationModal.vue`: one `DatePickerRange` edits `startDate` and `endDate`, and today the modal joins both messages under it.
   - `form.field(name)`, `form.FormError` and the scroll after a refusal each take one name. A refusal of only `endDate` would show no message on the control, would not mark it invalid, and would scroll to nothing (no element has `endDate`'s id).
   - **Needs:** a field over several names, for example `form.field(['startDate', 'endDate'])` and `<form.FormField :name="['startDate', 'endDate']">`. That gives one id, `invalid` when any of the names is refused, the joined messages, and the scroll mapping both names to that one id.
   - The same shape will come back for any range control: the period, week and attendance pickers, and from/to time pairs.
3. **[KIT/FORM] Inside `form.FormField`, the slot should be the only binding, and the value should come apart from the wiring.**
   - (a) The FormField's hint (`n-field-hint`) joins its id into the slot's `field.describedby`, but `form.field(name)` knows nothing about the hint. The template in the decision message (`<form.FormField ...><DatePickerField v-bind="form.field('endDate')" />`) therefore drops the hint from `aria-describedby`.
   - (b) With a draft, `form.field()` carries `onUpdate:modelValue`. Vue's `mergeProps` concatenates listeners, so `v-bind="form.field('maxMinutes')" v-model="maxTime"` writes BOTH the raw value into the draft path and the proxy. emmie edits through proxies in several places:
     - `FinancingFormDrawer.vue`: `maxTime` hours to minutes per rate interval, `awardedRoutePrice`, `selectedCareType`, `selectedLinkedCareType`;
     - `LearningGoalDrawer.vue`: `updateStartDate`.
   - **Needs:**
     - Give `form.FormField`'s slot both halves, separately: `field` (wiring, with the hint) and `model` (`modelValue`/`onUpdate:modelValue`).
     - Make `v-bind="field" v-bind="model"` the documented pairing, and `v-bind="field" v-model="proxy"` the documented escape for a converted value.
     - Then `form.field()` is needed only outside a FormField.
4. **[CONTROL] An "optional" marker beside the required one.**
   - The drawers mark a field that may stay empty with a light "optioneel": 17 of the 56 `DrawerFormField` uses (10 files) pass `optional`. "optioneel" appears 22 times in 17 files, also in labels written by hand (`LearningGoalDrawer.vue`).
   - `FormField`/`FormLabel` have only `required`. The `label-after` slot can carry it, but then every call site writes the marker and its look itself.
   - **Needs:** `optional` on `FormField`/`FormLabel`, its text a prop with a `createUiForm({texts})` default and its look a token, like `required` and `requiredLabel`.
5. **[CONTROL] The combobox filter matches only the option label.**
   - `user/domains/client/tabs/financing/modals/ContractSelect.vue` is emmie's own control only because no existing select had both a group header with a badge and an empty choice. On the package that is `GroupCombobox` with the `option` slot (`ContractRouteBadge`) and `clearLabel`. One thing is missing: its search matches the name OR the group's route label ("uwv" finds every UWV contract, `contract-groups.ts:47`), while the package filters on `optionLabel` alone.
   - **Needs:** a `filterText` getter (or a `matches(option, query)` prop) on Combobox, GroupCombobox and MultiCombobox, or opt-in matching on the group header text.
   - With it, ContractSelect can be deleted.

Not shape-changing, but worth deciding before review freezes:

- **[CONTROL] The required `placeholder` is already worked around.** emmie passes `placeholder=""` 34 times in 16 files, mostly on TextInput:
  - read-only shows, such as the category taken from the product in `FinancingFormDrawer.vue`;
  - number fields;
  - inline cells.

  Either accept `""` as the documented "none", or make the prop optional where a field has nothing to suggest.
- **[FORM] A 422 that carries more than field errors.** `user/domains/schedule/schedule/conflicts.ts` reads `response.data.conflicts` off the 422 to build the planner's refusal card. `handleSubmit` takes the 422 and returns only `'refused'`, so a caller that needs the payload must stay with its own try/catch plus `take()`.

  That works: it is the documented path. A read-only `form.lastRefusal`, the taken error, would let such a screen still use `handleSubmit`. Low priority: the planner is not a field form today.

## Per template

### 1. `user/domains/client/tabs/financing/modals/FinancingFormDrawer.vue` (1444 lines; with `shared/components/drawer/DrawerFormField.vue`, `DrawerSegmented.vue`)

**Maps cleanly**
- **DrawerFormField** to `FormField`. Its label row maps as follows:
  - the asterisk becomes `required`;
  - the `tooltip` slot inside the label becomes the `label-after` slot (`n-field-label-after`);
  - the `aside` slot on the label row becomes `aside` (`n-field-aside`);
  - the hint paragraphs placed in the slot today (`allocation-number-hint`, the order reference text) become the `hint` slot, and they gain `aria-describedby`, which they lack now.

  The `kebabCase(property)` id goes away: the form gives the ids.
- **The controls:**
  - `AdditiveInput prepend="€" append="per traject"` becomes `InputGroup`;
  - `VerticallyGrowingTextarea` becomes `Textarea autogrow`;
  - `GroupSelect searchable` becomes `GroupCombobox`;
  - `SearchableSelect allow-empty-placeholder="Geen"` becomes `Combobox clearLabel="Geen"`;
  - `ContractSelect`'s `allow-empty-placeholder` conditional on required becomes `:clear-label="required ? undefined : 'Geen contract koppelen'"` (README, "clear button only when the consumer names it");
  - `DatePickerField` stays emmie's, bound by `field()` (decided).
- **The form itself:**
  - `useForm(userHttpService, {scrollToError, scrollRoot})` becomes `useForm({draft})`. `scrollRoot` is no longer needed, because the ids are per form;
  - `submitting` exists on the form (`types.ts`, `UseFormSubmit.submitting`);
  - child parts that take the whole bag (`PersonRouteCareFields`, `AwardedPlafondField`, `FinancingDocumentField`, `PersonRouteBudgetFields`) can take `form: UseDraftForm<FinancingDraft>`. The type is exported for exactly this.
- **Fields that lock:**
  - Locked contract and product render a plain value instead of a control (a comment says the picker had no disabled state). The package selects take `disabled`, so emmie can choose either. That is emmie's call.
  - A select that is `disabled` while a product is chosen maps as is.

**Doesn't map**
- **Converted values bound through proxies:** `maxTime` is shown in the interval's unit and stored as `maxMinutes`. Inside `form.FormField` this needs the value apart from the wiring (ranked finding 3b), and the kit's bound controls (`form.NumberField name="maxMinutes"`) cannot express a conversion. The slot is the escape, so keep it first-class.
- **Two controls on one field:** NumberInput and a native `RangeInput` (`id="day-part-max"`, its own id) both edit `maxTime`. The package has no range control. The range can stay emmie's, bound by `aria`, or the package can add a Range control if a second consumer needs one; that is not a shape finding.
- **`DrawerSegmented`:** a radio group drawn as pills, whose disabled options carry a reason in `title`. RadioGroup takes `disabled` per option, but tokens cannot turn a fieldset of radios into a pill track. Per the README's rule it is a domain widget and stays emmie's, bound by `field()` (it already takes `id/invalid/describedby`). One small gap: it needs a string `label` for its `aria-label`, where the FormField's `aria` gives `aria-labelledby`. That is emmie's to change, by taking the labelledby.
- **The same field rendered in two places:** `debtorClientNumber` (allocation section and subcontracting section), `orderReference` and `invoiceEmail` each appear twice under different `v-if` branches. I read the branches as exclusive. If two ever render at once, `form.field(name)` gives both the same id. That is emmie's to keep exclusive; worth a line in the README's rules.

### 2. `user/domains/client/tabs/documents/custom-documents/care-plan/CarePlanLearningGoals.vue` (rows with dotted keys)

**Maps cleanly**
- **Row keys:** the template builds `camelCase(`learningGoals.${index}.title`)` by hand (`errorKey`, :282) on a bag folded flat. On the package the name is the draft path `learningGoals.${index}.title`, and `Path<D>` types `${number}` indexes (`path.ts`).
- **Removing a row** (`splice`, :387) shifts the messages of the rows below it. `withdraw('learningGoals')` drops the whole subtree, the documented fix.
- **The row ids** (`learning-goals-${index}-title`) come from the form.

**Doesn't map**
- The component edits its own sorted `deepCopy` and writes it back with a `watch` (:360), not the parent's draft. `form.field(path)` reads and writes the form's draft, so the copy has to go and the rows bind to the draft directly. Its sort (main goal first) then has to happen once, when the draft is built.
- That is emmie's to change; there is no package need. I note it because it is the general shape of emmie's "child component with a local copy" pattern, which the draft form does not accept.
- The template SingleSelects (`main-template`, `sub-template-${index}`) are not form fields (they apply a template and save nothing). They stay outside the form with a fixed id. Fine.

### 3. `user/services/dialog.ts` `createFormModal` + `user/domains/client/tabs/presence/components/VacationModal.vue` (33 callers of `createFormModal`)

**Maps cleanly**
- **The host:** it creates the form in a real `setup()` and passes `errors`/`submitting` down. It becomes `useForm()` with free names (the draft lives in the opener's store: `newVacation.mutable`), passed as `form: UseForm<...>`.
- **Code that can go:** the host's `scrollRoot` wrapper (`display: contents` div) and its comment about the shared 422 middleware. Per-form `handleSubmit` is exactly what that code works around.
- **The trigger button:** the button inside `DatePickerRange` carries `aria-invalid`/`aria-describedby` by hand. That becomes the FormField's `aria` binding for a native element.

**Doesn't map**
- **One control for two names:** `periodError` joins `errors.startDate` and `errors.endDate` (ranked finding 2).
- **Typed names through the host:** `createFormModal` is generic over the component, not over its field names. To keep the names typed, emmie's host should take the names as a type argument. That is emmie's to change; the package's exported `UseForm<T>` is enough.

### 4. `user/domains/schedule/components/PlanningToolBar.vue` (filter bar, "Alle ...")

**Maps cleanly**
- **"Alle" choices:** `placeholder="Alle locaties"` on a null filter means "all", so it is a value, not a hint. On the package that is `emptyDisplayValue="Alle locaties"`, plus `clearLabel="Alle locaties"` so the list itself can take the user back (today only "Wissen" can). Both props exist on SingleSelect, Combobox and GroupSelect.
- **No visible labels:** these selects stand without a FormField. `aria-label` lands on the inner control (README, attributes), so they can be named.
- `alphabetical-sort="false"` becomes the default (the caller's order).

**Doesn't map**
- Nothing in the package. A migration note: an attributify `w-45` sizes the trigger, not the root (README). In 45 of the 118 select uses (33 files), emmie sizes with attributify `w-*`/`min-w-*`. landing.9 showed this reads fine in a flex row, so it is a migration check, not a shape issue.

### 5. Inline table editing: `user/domains/client/components/overview-fields/NameEdit.vue`, `StatusEdit.vue` (+ `shared/components/InlineEditModifiers.vue`)

**Maps cleanly**
- `StatusEdit`'s SingleSelect with a fixed `id="statusId"` maps as is (one cell edits at a time).

**Doesn't map**
- **No error display:** today these cells have no form and no message at all. `NameEdit` is two native `<input>`s with no label. The package has no inline-cell gap of its own; a cell that wants messages takes `useForm()` with free names and places `form.FormError` (always rendered, made for rows). That is emmie's to change.
- **No placeholder:** `TextInput` would force a placeholder on a cell that has none (see the placeholder note above), and the inputs need `aria-label`s.
- **Keyboard:** save/cancel by keyboard stays `InlineEditModifiers`'s job. Escape on an open select only `preventDefault()`s (README), so a cell's Escape-to-cancel must skip a `defaultPrevented` Escape, the same rule as the drawer.

### 6. Custom option content: `user/domains/client/tabs/financing/modals/ContractSelect.vue`, `user/domains/finances/contracts/drawers/ContractFormDrawer.vue`

**Maps cleanly**
- **ContractSelect** (search box in the list, empty choice in red, route group headers, a badge per option, bold chosen option) becomes `GroupCombobox`, as follows:
  - the badge goes in the `option` slot;
  - the empty choice becomes `clearLabel`;
  - the headers become `groups[].text`;
  - "Contract verlopen" in the placeholder becomes `placeholder`.
- **ContractFormDrawer:** its `SearchableSelect #noResult` slot with only a sentence in it ("Geen gemeente gevonden.") becomes `emptyText`.

**Doesn't map**
- The search on the group's route label (ranked finding 5).

### 7. Component-scoped CSS on controls: `user/domains/finances/contracts/drawers/ProductFormDrawer.vue`, `ProductVersionDrawer.vue`, `auth/AuthLayout.vue`

**Maps cleanly**
- **The drawer looks** (`.drawer-fields :deep(input[type=...])`: min-height, radius, border width, surface background) become tokens: `--ui-control-min-height`, `--ui-control-radius`, `--ui-control-border-width`, `--ui-control-bg`.
- **The input-group corner fix** (`.rate-group :deep(input[type='number'])`) goes away with `InputGroup`.
- **The auth card:**
  - 40px and the 44px/16px mobile floor become `--ui-control-min-height` and `--ui-control-font-size` under emmie's media query (the token comment invites exactly that);
  - the focus ring becomes `--ui-focus-ring`;
  - the label look becomes `--ui-label-*`;
  - the checkbox becomes `--ui-check-*`;
  - the PasswordInput double ring it suppresses (`div:has(> input):focus-within`) should become a token, or a fix in PasswordInput.

**Doesn't map**
- **Scoping:** all of these apply to one area, not the whole app. That needs tokens set on an area (ranked finding 1). Today's `:deep()` rules on bare `input`/`select` would also hit the package's inner elements and fight its layer; unlayered, they win. So they must be removed, not kept beside the package. That is emmie's to change once finding 1 holds.
- **Native `<select>`:** the product drawers render real native selects, re-shown with `select { display: block }` because `form.scss` hides them app-wide. The package has no native select. That is emmie's: either a package SingleSelect, or keep the native one outside the package.

### 8. A form that catches its own 422: `user/domains/settings/care-legislations/pages/CareLegislationOverview.vue` (and `user/domains/schedule/schedule/conflicts.ts`)

**Maps cleanly**
- **`save()`:** it runs its own `try { persist } catch {}` with an `isSubmitting` ref and relies on the shared middleware to fill `errors`. On the package that is `form.handleSubmit(() => persist(...))`; its `submitting` replaces `isSubmitting`. The follow-up `loadUsage()` and the close stay in the action, so the button stays disabled for the whole flow, as the comment wants.
- **`clearErrors()` on opening another row** maps as is (the README's `clearErrors`).
- **`user/domains/client/tabs/contact-report/comment-errors.ts`** (`lastRefusedComment`) exists only to tell which mounted comment form a shared 422 belongs to. Per-form `handleSubmit` makes it unnecessary.

**Doesn't map**
- **Bare catches:** on the package, the middleware no longer fills any bag. A `catch {}` that relied on it drops the 422 silently: no message, no error. emmie has 81 `catch {` in Vue files (not all about 422s). Each one that sits around a save must become `handleSubmit` or `take()`. That is emmie's to change, and the epic should grep for it.
- **The planner:** it needs the 422's `conflicts` payload, not field errors (see the note under the ranked list).

### 9. `user/domains/client/tabs/learning-goals/components/LearningGoalDrawer.vue` (labels written by hand)

**Maps cleanly**
- **Labels:** each field has a hand-written `<label for>` outside an unlabelled ui-inputs FormField, because the FormField's label did not match the drawer look. Each becomes:
  - FormField `label` + `required`;
  - "optioneel" (ranked finding 4);
  - the explanatory `<span>` under the field becomes the `hint` slot (it gains `aria-describedby`).
- `CheckBoxInput` becomes `Checkbox`.
- `DatePickerField not-nullable` means no `clearLabel` (decided).

**Doesn't map**
- `:model-value` + `@update:model-value="updateStartDate"` is a proxy (ranked finding 3b).
- The look of the label row is the drawer look (ranked finding 1).
