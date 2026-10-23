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
import FormField from '../../src/components/FormField.vue';
import RadioGroup from '../../src/components/RadioGroup.vue';
import Switch from '../../src/components/Switch.vue';
import TextInput from '../../src/components/TextInput.vue';
import '../../styles.css';

interface Fruit {
    id: number;
    name: string;
}

const FRUITS: Fruit[] = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];

// What FormField's slot hands the control (`field`), plus the `required` the consumer passes
// itself (it is not in `field`: a control that does not declare it would take it as an attribute).
interface FieldSlot {
    field: {id: string; invalid: boolean; describedby: string | undefined};
    required: boolean;
}

/** Compose a control inside FormField — the documented consuming shape (label + error wiring). */
const renderInField = async (make: (slot: FieldSlot) => VNode, fieldProps: Record<string, unknown> = {}) =>
    await render(
        defineComponent(
            () => () =>
                // Wrap in <main> + <h1> so axe page-level rules (landmark-one-main,
                // page-has-heading-one, region) find valid document structure and do not
                // fire against the test harness page rather than the component under audit.
                h('main', [
                    h('h1', 'Test form'),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(
                        FormField as any,
                        {label: 'Fruit', id: 'fruit', ...fieldProps},
                        {
                            default: ({field}: Pick<FieldSlot, 'field'>) =>
                                make({field, required: Boolean(fieldProps.required)}),
                        },
                    ),
                ]),
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

describe('axe-core audits — zero violations, closed and open', () => {
    it('FormField + TextInput, resting', async () => {
        const screen = await renderInField((slot) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(TextInput as any, {
                ...slot.field,
                modelValue: '',
                'onUpdate:modelValue': noop,
                required: slot.required,
                placeholder: 'Type a fruit',
            }),
        );
        await expectNoViolations(screen.container);
    });

    it('FormField + TextInput, required with a rendered error (role=alert + describedby pairing)', async () => {
        const screen = await renderInField(
            (slot) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(TextInput as any, {
                    ...slot.field,
                    modelValue: '',
                    'onUpdate:modelValue': noop,
                    required: slot.required,
                }),
            {required: true, error: 'Fruit is required'},
        );
        await expectNoViolations(screen.container);
    });

    it('Checkbox — self-labelled, unchecked / checked / indeterminate', async () => {
        const checked = ref(false);
        const indeterminate = ref(true);
        const screen = await render(
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
        const screen = await renderInField(
            (slot) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(Checkbox as any, {
                    ...slot.field,
                    label: 'Accept the terms',
                    modelValue: false,
                    'onUpdate:modelValue': noop,
                    required: slot.required,
                }),
            // The checkbox brings its own inline label — FormField contributes error wiring only.
            {label: undefined, required: true, error: 'You must accept the terms'},
        );
        await expectNoViolations(screen.container);
    });

    it('Switch — role="switch" on the native checkbox, off and on', async () => {
        const on = ref(false);
        const screen = await render(
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
        const screen = await renderInField(
            (slot) =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(CheckboxGroup as any, {
                    ...slot.field,
                    options: FRUITS,
                    optionLabel: 'name',
                    label: 'Fruits',
                    modelValue: [2],
                    'onUpdate:modelValue': noop,
                    required: slot.required,
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
        const screen = await render(
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
    // each control adds its cases
});

describe('axe-core audits — the field frame: hint, label row and native groups', () => {
    it('a field with a hint, a label-after tooltip and an aside switch, while it shows a message', async () => {
        const notify = ref(false);
        const screen = await render(
            defineComponent(
                () => () =>
                    h('main', [
                        h('h1', 'Test form'),
                        h(
                            FormField,
                            {label: 'Budget', id: 'budget', error: 'Fill in a budget', required: true},
                            {
                                default: ({field}: {field: object}) =>
                                    h(TextInput, {...field, required: true, modelValue: ''}),
                                'label-after': () => h('span', {title: 'Per year'}, '?'),
                                aside: () =>
                                    h(Switch, {
                                        id: 'budget-hours',
                                        label: 'In hours',
                                        modelValue: notify.value,
                                        'onUpdate:modelValue': (next: boolean) => (notify.value = next),
                                    }),
                                hint: () => 'The amount awarded for the whole period',
                            },
                        ),
                    ]),
            ),
        );
        await expectNoViolations(screen.container);
    });

    it('a native group wired by the slot aria is named by the label and described by message and hint', async () => {
        const screen = await render(
            defineComponent(
                () => () =>
                    h('main', [
                        h('h1', 'Test form'),
                        h(
                            FormField,
                            {label: 'Laws', id: 'laws', error: 'Pick at least one'},
                            {
                                default: ({aria}: {aria: object}) =>
                                    h('div', {role: 'group', ...aria}, [
                                        h('button', {type: 'button', 'aria-pressed': 'false'}, 'Wlz'),
                                        h('button', {type: 'button', 'aria-pressed': 'true'}, 'Zvw'),
                                    ]),
                                hint: () => 'Any that apply',
                            },
                        ),
                    ]),
            ),
        );
        await expectNoViolations(screen.container);

        const group = screen.container.querySelector('[role="group"]') as HTMLElement;
        const label = document.getElementById(group.getAttribute('aria-labelledby') as string);
        expect(label?.textContent?.trim()).toBe('Laws');
        expect(group.getAttribute('aria-describedby')).toBe('laws-error laws-hint');
    });
});
