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
import {defineComponent, h, ref} from 'vue';

import Checkbox from '../../src/components/Checkbox.vue';
import Combobox from '../../src/components/Combobox.vue';
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
// Sorted render order: Apricot(2), Mango(3), Watermelon(1).

const cleanupTargets: Element[] = [];
afterEach(() => {
    for (const el of cleanupTargets.splice(0)) el.remove();
});

/**
 * Controlled host with REAL two-way v-model wiring, so a commit round-trips into the DOM
 * (chips render, the trigger text updates) exactly as in a consuming app.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
const renderControlled = <V>(component: any, initial: V, props: Record<string, unknown>) => {
    const model = ref(initial);
    render(
        defineComponent(
            () => () =>
                h(component, {
                    options: FRUITS,
                    label: 'name',
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

const menu = () =>
    document.querySelector('.ui-select__menu, .ui-combobox__menu, .ui-multiselect__menu, .ui-multicombobox__menu');
const optionAt = (index: number): HTMLElement => document.querySelectorAll<HTMLElement>('[role="option"]')[index];

describe('SingleSelect — real keyboard walk', () => {
    it('Tab focuses, Enter opens, ArrowDown navigates, Enter commits, menu closes', async () => {
        const model = renderControlled<number | null>(SingleSelect, null, {});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(trigger);
        expect(menu()).toBeNull();

        await userEvent.keyboard('{Enter}');
        expect(menu()).not.toBeNull();

        await userEvent.keyboard('{ArrowDown}{ArrowDown}');
        expect(trigger.getAttribute('aria-activedescendant')).toBe('fruit-opt-1');

        await userEvent.keyboard('{Enter}');
        expect(model.value).toBe(3); // sorted index 1 = Mango
        expect(menu()).toBeNull();
        expect(trigger.textContent).toContain('Mango');
    });

    it('Escape dismisses without committing', async () => {
        const model = renderControlled<number | null>(SingleSelect, null, {});

        await userEvent.tab();
        await userEvent.keyboard('{ArrowDown}'); // opens
        expect(menu()).not.toBeNull();

        await userEvent.keyboard('{ArrowDown}{Escape}');
        expect(menu()).toBeNull();
        expect(model.value).toBeNull();
    });

    it('a real click outside the control closes the menu', async () => {
        const outside = document.createElement('button');
        outside.type = 'button';
        outside.textContent = 'outside';
        document.body.append(outside);
        cleanupTargets.push(outside);
        renderControlled<number | null>(SingleSelect, null, {});

        await userEvent.click(document.getElementById('fruit') as HTMLElement);
        expect(menu()).not.toBeNull();

        await userEvent.click(outside);
        expect(menu()).toBeNull();
    });
});

describe('disabled controls genuinely receive no events', () => {
    it('a forced real click on a disabled trigger dispatches no click — the menu never opens', async () => {
        renderControlled<number | null>(SingleSelect, null, {disabled: true});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;
        expect(trigger.matches(':disabled')).toBe(true);

        // {force: true} skips Playwright's actionability wait but still routes through the
        // real input pipeline — Chromium suppresses click events on disabled controls, so
        // the handler must never run. (A synthetic VTU `trigger('click')` WOULD run it.)
        await userEvent.click(trigger, {force: true});
        expect(menu()).toBeNull();
    });

    it('real Tab skips a disabled trigger entirely, so keyboard input cannot reach it', async () => {
        renderControlled<number | null>(SingleSelect, null, {disabled: true});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;

        await userEvent.tab();
        expect(document.activeElement).not.toBe(trigger);

        await userEvent.keyboard('{Enter}{ArrowDown} ');
        expect(menu()).toBeNull();
    });

    it('a disabled TextInput receives no typed input', async () => {
        const model = renderControlled<string | null>(TextInput, 'untouched', {
            options: undefined,
            label: undefined,
            disabled: true,
        });
        const input = document.getElementById('fruit') as HTMLInputElement;
        expect(input.matches(':disabled')).toBe(true);

        await userEvent.tab(); // cannot land on the disabled input
        expect(document.activeElement).not.toBe(input);
        await userEvent.keyboard('typed');

        expect(input.value).toBe('untouched');
        expect(model.value).toBe('untouched');
    });

    it('a disabled chip-remove button removes nothing on a forced real click', async () => {
        const model = renderControlled<number[]>(MultiSelect, [2, 3], {disabled: true});
        const remove = document.querySelector<HTMLButtonElement>('.ui-multiselect__chip-remove');
        expect(remove).not.toBeNull();
        expect((remove as HTMLButtonElement).matches(':disabled')).toBe(true);

        await userEvent.click(remove as HTMLButtonElement, {force: true});
        expect(model.value).toEqual([2, 3]);
    });
});

describe('Combobox — real typing filters and commits', () => {
    it('typing filters the list, ArrowDown highlights, Enter commits and closes', async () => {
        const model = renderControlled<number | null>(Combobox, null, {});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.click(input);
        expect(menu()).not.toBeNull();
        expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);

        await userEvent.keyboard('ap');
        const options = document.querySelectorAll('[role="option"]');
        expect([...options].map((option) => option.textContent?.trim())).toEqual(['Apricot']);

        await userEvent.keyboard('{ArrowDown}');
        expect(input.getAttribute('aria-activedescendant')).toBe('fruit-opt-0');

        await userEvent.keyboard('{Enter}');
        expect(model.value).toBe(2);
        expect(input.value).toBe('Apricot');
        expect(menu()).toBeNull();
    });

    it('opening a filled combobox shows the FULL list and the first keystroke replaces the label (WR-0576)', async () => {
        renderControlled<number | null>(Combobox, 3, {}); // Mango committed
        const input = document.getElementById('fruit') as HTMLInputElement;
        expect(input.value).toBe('Mango');

        await userEvent.click(input);
        expect(menu()).not.toBeNull();
        // Browse-to-change: the committed label must not narrow the list on open…
        expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
        // …and the label sits fully selected (real Chromium selection, AFTER the click's
        // own caret placement), so typing REPLACES it instead of appending.
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe('Mango'.length);

        await userEvent.keyboard('ap');
        expect(input.value).toBe('ap'); // replaced, not 'Mangoap'
        const options = document.querySelectorAll('[role="option"]');
        expect([...options].map((option) => option.textContent?.trim())).toEqual(['Apricot']);
    });

    it('Escape reverts a half-typed query to the committed label', async () => {
        renderControlled<number | null>(Combobox, 2, {});
        const input = document.getElementById('fruit') as HTMLInputElement;
        expect(input.value).toBe('Apricot');

        await userEvent.click(input);
        await userEvent.keyboard('zzz');
        expect(input.value).toContain('zzz');

        await userEvent.keyboard('{Escape}');
        expect(input.value).toBe('Apricot');
        expect(menu()).toBeNull();
    });
});

describe('MultiSelect — chips, toggle-stays-open, Backspace', () => {
    it('a real click commit toggles membership while the menu STAYS open, and chips render', async () => {
        const model = renderControlled<number[]>(MultiSelect, [], {});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;

        await userEvent.click(trigger);
        expect(menu()).not.toBeNull();

        await userEvent.click(optionAt(0)); // Apricot
        expect(model.value).toEqual([2]);
        expect(menu()).not.toBeNull(); // toggle-in-place: commit must NOT close

        await userEvent.click(optionAt(1)); // Mango
        expect(model.value).toEqual([2, 3]);
        const chips = document.querySelectorAll('.ui-multiselect__chip');
        expect([...chips].map((chip) => chip.textContent?.trim())).toEqual(['Apricot', 'Mango']);

        await userEvent.click(optionAt(0)); // toggle Apricot back off
        expect(model.value).toEqual([3]);
    });

    it('a real click on a chip-remove button removes that chip and never opens the menu', async () => {
        const model = renderControlled<number[]>(MultiSelect, [2, 3], {});
        expect(document.querySelectorAll('.ui-multiselect__chip')).toHaveLength(2);

        await userEvent.click(document.querySelector('.ui-multiselect__chip-remove') as HTMLElement);
        expect(model.value).toEqual([3]);
        expect(menu()).toBeNull();
    });

    it('Backspace on the focused trigger pops the LAST committed value', async () => {
        const model = renderControlled<number[]>(MultiSelect, [2, 3], {});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;

        await userEvent.click(trigger); // real click focuses the trigger (and opens the menu)
        await userEvent.keyboard('{Backspace}');
        expect(model.value).toEqual([2]);

        await userEvent.keyboard('{Backspace}');
        expect(model.value).toEqual([]);

        await userEvent.keyboard('{Backspace}'); // empty model: no-op, no throw
        expect(model.value).toEqual([]);
    });
});

describe('MultiCombobox — input-as-trigger, real focus choreography', () => {
    it('a real Tab focuses the input and focus alone OPENS the list', async () => {
        renderControlled<number[]>(MultiCombobox, [], {});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(input);
        expect(menu()).not.toBeNull(); // kendo's searchable choreography — focus is the context
    });

    it('a real click commit toggles membership, STAYS open, clears the query, and REFOCUSES the input', async () => {
        const model = renderControlled<number[]>(MultiCombobox, [], {});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.click(input);
        await userEvent.keyboard('ma'); // filter → Mango
        expect(input.value).toBe('ma');

        // A real click lands on a non-focusable <li>, which genuinely drops DOM focus off
        // the input (the part happy-dom cannot prove) — the component must pull it back.
        await userEvent.click(optionAt(0));
        expect(model.value).toEqual([3]); // Mango toggled in
        expect(menu()).not.toBeNull(); // menu stays open
        expect(input.value).toBe(''); // query cleared — the full list is re-offered
        expect(document.activeElement).toBe(input); // focus returned to the input
    });

    it('real Backspace with an empty query pops the last chip', async () => {
        const model = renderControlled<number[]>(MultiCombobox, [2, 3], {});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.click(input);
        await userEvent.keyboard('{Backspace}');
        expect(model.value).toEqual([2]);
    });
});

describe('RadioGroup — NATIVE roving focus and arrow-key selection', () => {
    it('Tab enters the group, real arrow keys move focus AND selection, the model follows change', async () => {
        // The component hand-rolls no keyboard code — this walk proves the browser provides
        // the radio-group roving (shared `name`) and that the model mirrors the native
        // change events the arrows fire. Only a real browser can prove this: happy-dom
        // implements no radio roving at all.
        const model = renderControlled<number | null>(RadioGroup, null, {optionLabel: 'name', label: 'Fruit'});
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
        renderControlled<number | null>(RadioGroup, FRUITS[2].id, {optionLabel: 'name', label: 'Fruit'});
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
        const model = renderControlled<boolean>(Checkbox, false, {options: undefined, label: 'Accept', disabled: true});
        const input = document.getElementById('fruit') as HTMLInputElement;
        expect(input.matches(':disabled')).toBe(true);

        await userEvent.click(input, {force: true});
        expect(input.checked).toBe(false);
        expect(model.value).toBe(false);
    });

    it('real Tab skips a disabled Switch; keyboard input cannot reach it', async () => {
        const model = renderControlled<boolean>(Switch, false, {
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
        const model = renderControlled<boolean>(Switch, false, {options: undefined, label: 'Notifications'});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(input);

        await userEvent.keyboard(' ');
        expect(model.value).toBe(true);
        await userEvent.keyboard(' ');
        expect(model.value).toBe(false);
    });
});
