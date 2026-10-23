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
import {defineComponent, h} from 'vue';

import FormField from '../../src/components/FormField.vue';
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
                    placeholder: 'Type a fruit',
                }),
            {required: true, error: 'Fruit is required'},
        );
        await expectNoViolations(screen.container);
    });
    // each control adds its cases
});

describe('axe-core audits — the field frame and native groups', () => {
    it('a native group wired by the slot aria is named by the label and described by the message', async () => {
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
                            },
                        ),
                    ]),
            ),
        );
        await expectNoViolations(screen.container);

        const group = screen.container.querySelector('[role="group"]') as HTMLElement;
        const label = document.getElementById(group.getAttribute('aria-labelledby') as string);
        expect(label?.textContent?.trim()).toBe('Laws');
        expect(group.getAttribute('aria-describedby')).toBe('laws-error');
    });
});
