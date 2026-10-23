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
import Disclosure from '../../src/components/Disclosure.vue';
import FormField from '../../src/components/FormField.vue';
import Switch from '../../src/components/Switch.vue';
import TextInput from '../../src/components/TextInput.vue';
import '../../styles.css';

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
    // each control adds its cases
});

describe('axe-core audits — interactive non-form controls, zero violations', () => {
    // Pressable's cases return with it.

    it('Disclosure — heading-wrapped trigger, collapsed and expanded', async () => {
        const expanded = ref(false);
        const screen = await render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(
                        Disclosure as any,
                        {
                            id: 'details',
                            label: 'Details',
                            headingLevel: 2,
                            expanded: expanded.value,
                            'onUpdate:expanded': (value: boolean) => {
                                expanded.value = value;
                            },
                        },
                        {default: () => h('p', 'Panel body')},
                    ),
            ),
        );
        // Collapsed: aria-controls already points at a MOUNTED panel, so the IDREF resolves. axe
        // does NOT check that (measured: a dangling aria-controls raises neither a violation nor an
        // incomplete), which is why the hand-written assertion in the next test exists.
        await expectNoViolations(screen.container);

        await userEvent.click(document.getElementById('details') as HTMLElement);
        expect(expanded.value).toBe(true);
        await expectNoViolations(screen.container);
    });

    // The live shape this replaces is `<h2 @click="collapse?.toggle">`. axe cannot see that defect
    // either (a heading with a click handler violates no ARIA rule), so pin the correct output.
    it('the Disclosure heading CONTAINS the button and never behaves as one', async () => {
        const screen = await render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(Disclosure as any, {id: 'row', label: 'Overview', headingLevel: 2}),
            ),
        );

        const heading = screen.container.querySelector('h2') as HTMLElement;
        expect(heading.getAttribute('role')).toBeNull();
        expect(heading.getAttribute('tabindex')).toBeNull();
        expect(heading.firstElementChild?.tagName).toBe('BUTTON');

        const trigger = heading.querySelector('button') as HTMLButtonElement;
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        // The IDREF resolves in the collapsed state, in a real document. This assertion — not the
        // green axe run above — is what goes red if the panel ever becomes a v-if (teeth-proven).
        expect(document.getElementById(trigger.getAttribute('aria-controls') as string)).not.toBeNull();
    });
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
