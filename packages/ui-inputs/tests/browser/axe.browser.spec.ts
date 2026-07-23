import type {VNode} from 'vue';

// Browser-mode AXE-CORE spec (real Chromium) — scope: contract + interaction only; unit
// behaviour stays in the happy-dom suite; never duplicate a happy-dom spec here.
//
// The happy-dom suite asserts ARIA attribute-by-attribute; this file runs a real axe-core
// audit over each mounted component in BOTH closed and open states. Controls are composed
// inside FormField (the documented consuming shape) so every control carries its label —
// the pairing a real territory ships. Zero violations expected; any rule that ever needs
// disabling must be documented inline with the reason.
import axe from 'axe-core';
import {describe, expect, it} from 'vitest';
import {render} from 'vitest-browser-vue';
import {userEvent} from 'vitest/browser';
import {defineComponent, h, ref} from 'vue';

import Checkbox from '../../src/components/Checkbox.vue';
import CheckboxGroup from '../../src/components/CheckboxGroup.vue';
import Combobox from '../../src/components/Combobox.vue';
import FormField from '../../src/components/FormField.vue';
import MultiCombobox from '../../src/components/MultiCombobox.vue';
import MultiSelect from '../../src/components/MultiSelect.vue';
import RadioGroup from '../../src/components/RadioGroup.vue';
import SingleSelect from '../../src/components/SingleSelect.vue';
import Switch from '../../src/components/Switch.vue';
import TextInput from '../../src/components/TextInput.vue';
import '../../styles.css';

type Fruit = {id: number; name: string};

const FRUITS: Fruit[] = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];

type FieldSlot = {controlId: string; errorId: string; required: boolean; invalid: boolean; describedby?: string};

/** Compose a control inside FormField — the documented consuming shape (label + error wiring). */
const renderInField = (make: (slot: FieldSlot) => VNode, fieldProps: Record<string, unknown> = {}) =>
    render(
        defineComponent(
            () => () =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(FormField as any, {label: 'Fruit', id: 'fruit', ...fieldProps}, {default: make}),
        ),
    );

/** Run a real axe audit over the mounted subtree; format violations so a failure names them. */
const expectNoViolations = async (node: Element) => {
    const results = await axe.run(node);
    const formatted = results.violations.map(
        (violation) =>
            `${violation.id} [${violation.impact ?? 'n/a'}]: ${violation.nodes.map((n) => n.html).join(' | ')}`,
    );
    expect(formatted).toEqual([]);
};

const noop = () => undefined;

// Shared select-control prop bag (id/aria wiring threaded from the field slot).
const selectProps = (slot: FieldSlot) => ({
    options: FRUITS,
    label: 'name',
    id: slot.controlId,
    required: slot.required,
    invalid: slot.invalid,
    describedby: slot.describedby,
});

describe('axe-core audits — zero violations, closed and open', () => {
    it('FormField + TextInput, resting', async () => {
        const screen = renderInField((slot) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(TextInput as any, {
                id: slot.controlId,
                modelValue: '',
                'onUpdate:modelValue': noop,
                required: slot.required,
                invalid: slot.invalid,
                describedby: slot.describedby,
                placeholder: 'Type a fruit',
            }),
        );
        await expectNoViolations(screen.container);
    });

    it('FormField + TextInput, required with a rendered error (role=alert + describedby pairing)', async () => {
        const screen = renderInField(
            (slot) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(TextInput as any, {
                    id: slot.controlId,
                    modelValue: '',
                    'onUpdate:modelValue': noop,
                    required: slot.required,
                    invalid: slot.invalid,
                    describedby: slot.describedby,
                }),
            {required: true, error: 'Fruit is required'},
        );
        await expectNoViolations(screen.container);
    });

    it('FormField + SingleSelect, closed and open', async () => {
        const model = ref<number | null>(null);
        const screen = renderInField((slot) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(SingleSelect as any, {...selectProps(slot), modelValue: model.value, 'onUpdate:modelValue': noop}),
        );
        await expectNoViolations(screen.container);

        await userEvent.click(document.getElementById('fruit') as HTMLElement);
        expect(document.querySelector('.ui-select__menu')).not.toBeNull();
        await userEvent.keyboard('{ArrowDown}'); // highlight → aria-activedescendant set
        await expectNoViolations(screen.container);
    });

    it('FormField + Combobox, closed and open with a typed filter', async () => {
        const model = ref<number | null>(null);
        const screen = renderInField((slot) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(Combobox as any, {...selectProps(slot), modelValue: model.value, 'onUpdate:modelValue': noop}),
        );
        await expectNoViolations(screen.container);

        await userEvent.click(document.getElementById('fruit') as HTMLElement);
        await userEvent.keyboard('ap{ArrowDown}');
        expect(document.querySelector('.ui-combobox__menu')).not.toBeNull();
        await expectNoViolations(screen.container);
    });

    it('FormField + MultiSelect, closed with chips and open (aria-multiselectable listbox)', async () => {
        const model = ref<number[]>([2]);
        const screen = renderInField((slot) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(MultiSelect as any, {...selectProps(slot), modelValue: model.value, 'onUpdate:modelValue': noop}),
        );
        await expectNoViolations(screen.container);

        await userEvent.click(document.getElementById('fruit') as HTMLElement);
        expect(document.querySelector('.ui-multiselect__menu')).not.toBeNull();
        await expectNoViolations(screen.container);
    });

    it('FormField + MultiCombobox, closed with chips and open with a typed filter', async () => {
        const model = ref<number[]>([2]);
        const screen = renderInField((slot) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(MultiCombobox as any, {...selectProps(slot), modelValue: model.value, 'onUpdate:modelValue': noop}),
        );
        await expectNoViolations(screen.container);

        await userEvent.click(document.getElementById('fruit') as HTMLElement);
        await userEvent.keyboard('a{ArrowDown}');
        expect(document.querySelector('.ui-multicombobox__menu')).not.toBeNull();
        await expectNoViolations(screen.container);
    });

    // HAND-WRITTEN value assertion — axe cannot check this (WCAG 4.1.2 *Value* is semantic:
    // there is no axe rule for "N items selected but nothing says so"). A green axe run above
    // must never be read as covering it; this pins the fix so a revert goes red HERE.
    it('MultiSelect trigger conveys the committed selection while closed — real accessible-value surface', () => {
        const model = ref<number[]>([2, 1]);
        renderInField((slot) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(MultiSelect as any, {...selectProps(slot), modelValue: model.value, 'onUpdate:modelValue': noop}),
        );

        const trigger = document.querySelector('.ui-multiselect__trigger') as HTMLElement;
        // The trigger's text content — its value-as-content surface — carries the option
        // labels in selection order (labels only, so nothing needs translating).
        expect(trigger.textContent).toContain('Apricot, Watermelon');

        // And the span is genuinely screen-reader-only in a REAL layout engine: rendered
        // (in the accessibility tree — display:none/visibility:hidden would defeat it) but
        // visually clipped to 1×1.
        const srValue = trigger.querySelector('.ui-multiselect__sr-value') as HTMLElement;
        const style = getComputedStyle(srValue);
        expect(style.position).toBe('absolute');
        expect(style.width).toBe('1px');
        expect(style.height).toBe('1px');
        expect(style.display).not.toBe('none');
        expect(style.visibility).not.toBe('hidden');
    });
});

describe('axe-core audits — checkbox family, zero violations', () => {
    it('Checkbox — self-labelled, unchecked / checked / indeterminate', async () => {
        const checked = ref(false);
        const indeterminate = ref(true);
        const screen = render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(Checkbox as any, {
                        id: 'terms',
                        label: 'Accept the terms',
                        indeterminate: indeterminate.value,
                        modelValue: checked.value,
                        'onUpdate:modelValue': (value: boolean) => {
                            checked.value = value;
                        },
                    }),
            ),
        );
        await expectNoViolations(screen.container);

        indeterminate.value = false;
        await userEvent.click(document.getElementById('terms') as HTMLElement);
        expect(checked.value).toBe(true);
        await expectNoViolations(screen.container);
    });

    it('Checkbox — inside FormField (no field label; own label) with a rendered error', async () => {
        const screen = renderInField(
            (slot) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(Checkbox as any, {
                    id: slot.controlId,
                    label: 'Accept the terms',
                    modelValue: false,
                    'onUpdate:modelValue': noop,
                    required: slot.required,
                    invalid: slot.invalid,
                    describedby: slot.describedby,
                }),
            // The checkbox brings its own inline label — FormField contributes error wiring only.
            {label: undefined, required: true, error: 'You must accept the terms'},
        );
        await expectNoViolations(screen.container);
    });

    it('Switch — role="switch" on the native checkbox, off and on', async () => {
        const on = ref(false);
        const screen = render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(Switch as any, {
                        id: 'notify',
                        label: 'Email notifications',
                        modelValue: on.value,
                        'onUpdate:modelValue': (value: boolean) => {
                            on.value = value;
                        },
                    }),
            ),
        );
        await expectNoViolations(screen.container);

        await userEvent.click(document.getElementById('notify') as HTMLElement);
        expect(on.value).toBe(true);
        await expectNoViolations(screen.container);
    });

    it('CheckboxGroup — fieldset/legend, required (sr-only conveyance) and invalid with an error', async () => {
        const screen = renderInField(
            (slot) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(CheckboxGroup as any, {
                    id: slot.controlId,
                    options: FRUITS,
                    optionLabel: 'name',
                    label: 'Fruits',
                    modelValue: [2],
                    'onUpdate:modelValue': noop,
                    required: slot.required,
                    invalid: slot.invalid,
                    describedby: slot.describedby,
                }),
            // The group self-labels via its legend — FormField contributes error wiring only.
            // This composition also proves the aria-required-free fieldset passes
            // aria-allowed-attr (role=group forbids aria-required — the legend conveys it).
            {label: undefined, required: true, error: 'Pick at least one fruit'},
        );
        await expectNoViolations(screen.container);
    });

    it('RadioGroup — role=radiogroup fieldset with aria-required, none and one selected', async () => {
        const choice = ref<number | null>(null);
        const screen = render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(RadioGroup as any, {
                        id: 'fruit-choice',
                        options: FRUITS,
                        optionLabel: 'name',
                        label: 'Favourite fruit',
                        required: true,
                        modelValue: choice.value,
                        'onUpdate:modelValue': (value: number | null) => {
                            choice.value = value;
                        },
                    }),
            ),
        );
        await expectNoViolations(screen.container);

        await userEvent.click(document.getElementById('fruit-choice-opt-1') as HTMLElement);
        expect(choice.value).toBe(2);
        await expectNoViolations(screen.container);
    });
});
