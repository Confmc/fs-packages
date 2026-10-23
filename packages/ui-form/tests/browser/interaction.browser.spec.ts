// Browser-mode INTERACTION spec (real Chromium, real CDP events) — scope: contract +
// interaction only; unit behaviour stays in the happy-dom suite; never duplicate a
// happy-dom spec here.
//
// What only a real browser can prove: disabled controls GENUINELY receive no events (VTU
// `trigger()` dispatches synthetically and would run handlers a real browser suppresses —
// the documented vacuous-assertion trap), Tab order is real, and keyboard walks ride the
// full CDP input pipeline.
import {describe, expect, it} from 'vitest';
import {render} from 'vitest-browser-vue';
import {userEvent} from 'vitest/browser';
import {defineComponent, h, ref} from 'vue';

import Disclosure from '../../src/components/Disclosure.vue';
import '../../styles.css';

/**
 * The same contest on `Disclosure`'s trigger, and the same browser-only reason: implicit form
 * submission is a real navigation, not something a DOM shim can be trusted to model. The trigger's
 * `type="button"` used to sit ABOVE the `$attrs` spread, where an attribute loses to it — so a
 * consumer's `type="submit"` made a `<Disclosure>` inside a form submit it, while also expanding
 * (measured pre-fix in this browser: `TYPE=submit SUBMITS=1 EXPANDED=true`).
 */
describe('Disclosure — a consumer `type` cannot make its trigger submit a surrounding form', () => {
    const renderInForm = async (children: () => unknown[]) => {
        const submits = ref(0);
        await render(
            defineComponent(
                () => () =>
                    h(
                        'form',
                        {
                            onSubmit: (event: Event) => {
                                event.preventDefault(); // a real submit would navigate the runner away
                                submits.value += 1;
                            },
                        },
                        children(),
                    ),
            ),
        );
        return submits;
    };

    it('toggles WITHOUT submitting, even when handed type="submit"', async () => {
        const submits = await renderInForm(() => [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(Disclosure as any, {id: 'submitting', label: 'Details', type: 'submit'}),
        ]);
        const trigger = document.querySelector('.ui-disclosure__trigger') as HTMLElement;

        await userEvent.click(trigger);

        expect(trigger.getAttribute('type')).toBe('button');
        expect(submits.value).toBe(0);
        // …and it still does its own job. A trigger that submitted nothing because it had stopped
        // working would satisfy the line above just as well.
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('POSITIVE CONTROL — a plain <button> in the same fixture DOES submit it', async () => {
        const submits = await renderInForm(() => [h('button', {id: 'disclosure-native-submit'}, 'Go')]);

        await userEvent.click(document.getElementById('disclosure-native-submit') as HTMLElement);

        expect(submits.value).toBe(1);
    });
});

describe('Disclosure — real keyboard walk', () => {
    const trigger = () => document.getElementById('details') as HTMLButtonElement;
    const panel = () => document.getElementById('details-panel') as HTMLElement;

    const renderDisclosure = async (props: Record<string, unknown> = {}) => {
        const expanded = ref(false);
        await render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(
                        Disclosure as any,
                        {
                            id: 'details',
                            label: 'Details',
                            headingLevel: 2,
                            ...props,
                            expanded: expanded.value,
                            'onUpdate:expanded': (value: boolean) => {
                                expanded.value = value;
                            },
                        },
                        {default: () => h('p', 'Panel body')},
                    ),
            ),
        );
        return expanded;
    };

    it('Tab focuses the trigger, Enter and Space flip aria-expanded and show/hide the region', async () => {
        const expanded = await renderDisclosure();

        // The heading is NOT the tab stop — the button inside it is.
        await userEvent.tab();
        expect(document.activeElement).toBe(trigger());
        expect(document.activeElement?.tagName).toBe('BUTTON');

        expect(trigger().getAttribute('aria-expanded')).toBe('false');
        expect(getComputedStyle(panel()).display).toBe('none');

        await userEvent.keyboard('{Enter}');
        expect(expanded.value).toBe(true);
        await expect.poll(() => trigger().getAttribute('aria-expanded')).toBe('true');
        expect(getComputedStyle(panel()).display).not.toBe('none');

        await userEvent.keyboard(' ');
        expect(expanded.value).toBe(false);
        await expect.poll(() => trigger().getAttribute('aria-expanded')).toBe('false');
        expect(getComputedStyle(panel()).display).toBe('none');
    });

    it('the heading itself is inert — only the button it contains is reachable', async () => {
        await renderDisclosure();
        const heading = document.querySelector('h2') as HTMLElement;

        // The defect being replaced is a heading that behaves as a control: not focusable, and a
        // real click on the heading padding (outside the button) toggles nothing.
        heading.focus();
        expect(document.activeElement).not.toBe(heading);
    });

    it('real Tab skips a disabled Disclosure trigger', async () => {
        const expanded = await renderDisclosure({disabled: true});

        await userEvent.tab();
        expect(document.activeElement).not.toBe(trigger());
        await userEvent.keyboard('{Enter} ');
        expect(expanded.value).toBe(false);
    });
});

/**
 * The consumer's fall-through `@click` on a DISABLED Disclosure trigger. This describe lives in the
 * browser suite and CANNOT be moved into the happy-dom one: happy-dom does not run listeners for a
 * `dispatchEvent`-delivered click on a disabled `<button>`, so it reports this defect as ABSENT —
 * with a working positive control, which is what makes it dangerous. Chromium runs them (measured
 * on the unfixed code: enabled=1, disabled=1). A happy-dom version of this spec would pass on the
 * broken component and pin the wrong behaviour permanently.
 *
 * `dispatchEvent` rather than `userEvent.click` is likewise deliberate: Chromium's real input
 * pipeline never produces a click on a disabled native button at all, so a forced user click leaves
 * BOTH arms at zero and asserts nothing about the merge order. The reachable path is the
 * programmatic one, and that is the one the guard has to close.
 */
describe("Disclosure — a disabled trigger and the consumer's fall-through @click", () => {
    const trigger = () => document.getElementById('leaky') as HTMLButtonElement;

    const renderWithConsumerClick = async (disabled: boolean) => {
        const consumerClicks = ref(0);
        const expanded = ref(false);
        await render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(
                        Disclosure as any,
                        {
                            id: 'leaky',
                            label: 'Details',
                            disabled,
                            onClick: () => {
                                consumerClicks.value += 1;
                            },
                            expanded: expanded.value,
                            'onUpdate:expanded': (value: boolean) => {
                                expanded.value = value;
                            },
                        },
                        {default: () => h('p', 'Panel body')},
                    ),
            ),
        );
        return {consumerClicks, expanded};
    };

    const dispatchClick = (element: Element): void => {
        element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    };

    it('runs NEITHER toggle nor the consumer handler — inert, not merely un-toggling', async () => {
        const {consumerClicks, expanded} = await renderWithConsumerClick(true);

        dispatchClick(trigger());

        // The defect: `v-bind="$attrs"` merged ahead of `@click` put the consumer's handler FIRST,
        // so it ran before `toggle` could stop the event. Our handler must be merged first and stop.
        expect(consumerClicks.value).toBe(0);
        expect(expanded.value).toBe(false);
    });

    it('POSITIVE CONTROL — the same fixture, enabled, runs BOTH', async () => {
        const {consumerClicks, expanded} = await renderWithConsumerClick(false);

        dispatchClick(trigger());

        // Without this arm the zeros above are consistent with a fixture that wires nothing, or
        // with a stop that swallows the consumer's handler unconditionally.
        expect(consumerClicks.value).toBe(1);
        expect(expanded.value).toBe(true);
        await expect.poll(() => trigger().getAttribute('aria-expanded')).toBe('true');
    });
});
