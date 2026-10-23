// Browser-mode INTERACTION spec (real Chromium, real CDP events) — scope: contract +
// interaction only; unit behaviour stays in the happy-dom suite; never duplicate a
// happy-dom spec here.
//
// What only a real browser can prove: disabled controls GENUINELY receive no events (VTU
// `trigger()` dispatches synthetically and would run handlers a real browser suppresses —
// the documented vacuous-assertion trap), Tab order is real, and keyboard walks ride the
// full CDP input pipeline.
import {afterEach, describe, expect, it} from 'vitest';
import {render} from 'vitest-browser-vue';
import {userEvent} from 'vitest/browser';
import {defineComponent, h, nextTick, ref} from 'vue';

import Checkbox from '../../src/components/Checkbox.vue';
import CheckboxGroup from '../../src/components/CheckboxGroup.vue';
import RadioGroup from '../../src/components/RadioGroup.vue';
import Switch from '../../src/components/Switch.vue';
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

const cleanupTargets: Element[] = [];
afterEach(() => {
    for (const el of cleanupTargets.splice(0)) el.remove();
});

/**
 * Controlled host with REAL two-way v-model wiring, so a commit round-trips into the DOM
 * (chips render, the trigger text updates) exactly as in a consuming app.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
const renderControlled = async <V>(component: any, initial: V, props: Record<string, unknown>) => {
    const model = ref(initial);
    await render(
        defineComponent(
            () => () =>
                h(component, {
                    options: FRUITS,
                    optionLabel: 'name',
                    id: 'fruit',
                    ...props,
                    modelValue: model.value,
                    'onUpdate:modelValue': (value: V) => {
                        model.value = value;
                    },
                }),
        ),
    );
    return model;
};

describe('RadioGroup — NATIVE roving focus and arrow-key selection', () => {
    it('Tab enters the group, real arrow keys move focus AND selection, the model follows change', async () => {
        // The component hand-rolls no keyboard code — this walk proves the browser provides
        // the radio-group roving (shared `name`) and that the model mirrors the native
        // change events the arrows fire. Only a real browser can prove this: happy-dom
        // implements no radio roving at all.
        const model = await renderControlled<number | null>(RadioGroup, null, {optionLabel: 'name', label: 'Fruit'});
        const radioAt = (index: number) => document.getElementById(`fruit-opt-${index}`) as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(radioAt(0)); // first radio takes the group's tab stop
        expect(model.value).toBeNull(); // focus alone selects nothing

        await userEvent.keyboard('{ArrowDown}'); // native: moves focus AND checks the next radio
        expect(document.activeElement).toBe(radioAt(1));
        expect(model.value).toBe(FRUITS[1].id);

        await userEvent.keyboard('{ArrowRight}'); // horizontal arrows rove too
        expect(document.activeElement).toBe(radioAt(2));
        expect(model.value).toBe(FRUITS[2].id);

        await userEvent.keyboard('{ArrowUp}');
        expect(document.activeElement).toBe(radioAt(1));
        expect(model.value).toBe(FRUITS[1].id);
    });

    it('the checked radio is the single tab stop — Tab leaves the rest of the group alone', async () => {
        await renderControlled<number | null>(RadioGroup, FRUITS[2].id, {optionLabel: 'name', label: 'Fruit'});
        const checked = document.getElementById('fruit-opt-2') as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(checked); // roving tabindex: straight to the checked one

        await userEvent.tab();
        // One tab stop per group: the next Tab exits rather than visiting the siblings.
        expect(document.activeElement?.getAttribute('type')).not.toBe('radio');
    });
});

describe('checkbox family — disabled controls genuinely receive no events', () => {
    it('a forced real click on a disabled Checkbox never checks it', async () => {
        const model = await renderControlled<boolean>(Checkbox, false, {
            options: undefined,
            label: 'Accept',
            disabled: true,
        });
        const input = document.getElementById('fruit') as HTMLInputElement;
        expect(input.matches(':disabled')).toBe(true);

        await userEvent.click(input, {force: true});
        expect(input.checked).toBe(false);
        expect(model.value).toBe(false);
    });

    it('real Tab skips a disabled Switch; keyboard input cannot reach it', async () => {
        const model = await renderControlled<boolean>(Switch, false, {
            options: undefined,
            label: 'Notifications',
            disabled: true,
        });
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).not.toBe(input);
        await userEvent.keyboard(' ');
        expect(model.value).toBe(false);
    });

    it('an enabled Switch toggles with a real keyboard Space', async () => {
        const model = await renderControlled<boolean>(Switch, false, {options: undefined, label: 'Notifications'});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(input);

        await userEvent.keyboard(' ');
        expect(model.value).toBe(true);
        await userEvent.keyboard(' ');
        expect(model.value).toBe(false);
    });
});

/**
 * WR-0918: a disabled checkbox-family control runs NO consumer listener — the rule Pressable and
 * Disclosure already keep. This lives in the browser suite on purpose: happy-dom drops a
 * dispatched click on a disabled input before any listener runs, so it reports the click path
 * clean on the defective code, while Chromium runs every listener AND flips the native `checked`.
 */
describe('checkbox family — a disabled control runs no consumer listener (WR-0918)', () => {
    const FAMILY = [
        {name: 'Checkbox', component: Checkbox, props: {id: 'fam', label: 'Accept'}, initial: false},
        {name: 'Switch', component: Switch, props: {id: 'fam', label: 'Notify'}, initial: false},
        {
            name: 'CheckboxGroup',
            component: CheckboxGroup,
            props: {id: 'fam', label: 'Fruit', options: FRUITS, optionLabel: 'name'},
            initial: [] as number[],
        },
        {
            name: 'RadioGroup',
            component: RadioGroup,
            props: {id: 'fam', label: 'Fruit', options: FRUITS, optionLabel: 'name'},
            initial: null,
        },
    ] as const;

    const renderWithConsumer = async (
        member: (typeof FAMILY)[number],
        disabled: boolean,
        phase: '' | 'Capture' = '',
    ) => {
        const heard: string[] = [];
        const model = ref<unknown>(member.initial);
        await render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(member.component as any, {
                        ...member.props,
                        disabled,
                        modelValue: model.value,
                        'onUpdate:modelValue': (value: unknown) => {
                            model.value = value;
                        },
                        [`onClick${phase}`]: () => heard.push('click'),
                        [`onInput${phase}`]: () => heard.push('input'),
                        [`onChange${phase}`]: () => heard.push('change'),
                    }),
            ),
        );
        // A `change` crosses two Vue invokers on its way to a group's consumer (the radio's own, then
        // the fieldset's), and Vue drops the second when the event is stamped no later than that
        // invoker was attached — a dispatch in the millisecond of mount. Measured as a flaky enabled arm.
        await new Promise((resolve) => setTimeout(resolve, 5));
        const input = document.querySelector<HTMLInputElement>('#fam input, input#fam') as HTMLInputElement;
        return {heard, model, input};
    };

    for (const member of FAMILY) {
        it(`${member.name}: a dispatched click, input and change reach no consumer, and nothing flips`, async () => {
            const {heard, model, input} = await renderWithConsumer(member, true);
            expect(input.matches(':disabled')).toBe(true);

            // Cancelable, as a real click and `HTMLElement.click()` are: only a cancelable click's
            // default action — the checkedness flip — can be withheld.
            input.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
            input.dispatchEvent(new Event('input', {bubbles: true}));
            input.dispatchEvent(new Event('change', {bubbles: true}));
            await nextTick();

            expect(heard).toEqual([]);
            expect(input.checked).toBe(false);
            expect(model.value).toEqual(member.initial);
        });

        it(`POSITIVE CONTROL — ${member.name}, enabled, hears all three and commits`, async () => {
            const {heard, model, input} = await renderWithConsumer(member, false);

            input.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
            await nextTick();

            // Without this arm the empty list above is consistent with a fixture that wires
            // nothing, or with a guard that stops every event whether disabled or not.
            expect(heard).toEqual(['click', 'input', 'change']);
            expect(input.checked).toBe(true);
            expect(model.value).not.toEqual(member.initial);
        });
    }

    for (const member of FAMILY) {
        // A consumer `@click.capture` arrives through $attrs and is attached while the element is
        // created; the guard must still run ahead of it, on the very same element.
        it(`${member.name}: a consumer's CAPTURE listeners do not run either`, async () => {
            const {heard, input} = await renderWithConsumer(member, true, 'Capture');

            input.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
            input.dispatchEvent(new Event('input', {bubbles: true}));
            input.dispatchEvent(new Event('change', {bubbles: true}));
            await nextTick();

            expect(heard).toEqual([]);
        });

        it(`POSITIVE CONTROL — ${member.name}, enabled, runs the consumer's capture listeners`, async () => {
            const {heard, input} = await renderWithConsumer(member, false, 'Capture');

            input.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
            await nextTick();

            expect(heard).toEqual(['click', 'input', 'change']);
        });
    }

    for (const member of FAMILY.filter(({name}) => name.endsWith('Group'))) {
        it(`${member.name}: a real pointer on an option's label text reaches no consumer on the group`, async () => {
            const {heard} = await renderWithConsumer(member, true);

            await userEvent.click(document.querySelector('.ui-check__label') as HTMLElement, {force: true});

            expect(heard).toEqual([]);
        });

        it(`POSITIVE CONTROL — ${member.name}, enabled, the same pointer reaches the consumer`, async () => {
            const {heard} = await renderWithConsumer(member, false);

            await userEvent.click(document.querySelector('.ui-check__label') as HTMLElement);

            expect(heard).toContain('click');
        });
    }
});

/** WR-1922 with a real pointer — the happy-dom suite owns the full matrix (declined-change.spec.ts). */
describe('checkbox family — a real click the host declines leaves the model showing (WR-1922)', () => {
    const renderDeclining = async (component: unknown, props: Record<string, unknown>) => {
        await render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(component as any, {...props, 'onUpdate:modelValue': () => {}}),
            ),
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
    };

    it('Switch goes back to off', async () => {
        await renderDeclining(Switch, {id: 'decline', label: 'Notify', modelValue: false});
        const input = document.getElementById('decline') as HTMLInputElement;

        await userEvent.click(input);

        await expect.poll(() => input.checked).toBe(false);
    });

    it('RadioGroup puts the check back on the committed radio', async () => {
        await renderDeclining(RadioGroup, {
            id: 'decline',
            label: 'Fruit',
            options: FRUITS,
            optionLabel: 'name',
            modelValue: 1,
        });
        const radios = [...document.querySelectorAll<HTMLInputElement>('#decline input')];

        await userEvent.click(radios[1]);

        await expect.poll(() => radios.map((radio) => radio.checked)).toEqual([true, false, false]);
    });
});
