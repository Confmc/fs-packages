// Browser-mode PAINT spec (real Chromium) — the checked state of Checkbox, RadioGroup and Switch
// under forced colours, asserted on screenshot pixels.
//
// Why pixels and not getComputedStyle: forced colours replace author colours at paint time, so a
// computed value can be right while the paint is not. The check mark computes white on the broken
// sheet and on the fixed one alike; only the screenshot tells them apart. happy-dom cannot paint,
// so this spec can only live in the browser suite.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {render} from 'vitest-browser-vue';
import {cdp, page} from 'vitest/browser';

import Checkbox from '../../src/components/Checkbox.vue';
import RadioGroup from '../../src/components/RadioGroup.vue';
import Switch from '../../src/components/Switch.vue';
import TextInput from '../../src/components/TextInput.vue';
import '../../styles.css';

type Mode = 'none' | 'active';

const setForcedColors = (mode: Mode) =>
    cdp().send('Emulation.setEmulatedMedia', {features: [{name: 'forced-colors', value: mode}]});

const hosts: Element[] = [];
const runnerViewport = {width: window.innerWidth, height: window.innerHeight};

// The runner scales a viewport larger than its window, and a scaled screenshot resamples the
// control onto a sub-pixel grid. A small viewport renders 1:1.
beforeEach(async () => {
    slot = 0;
    await page.viewport(760, 480);
});

afterEach(async () => {
    for (const host of hosts.splice(0)) host.remove();
    await cdp().send('Emulation.setEmulatedMedia', {features: []});
    await page.viewport(runnerViewport.width, runnerViewport.height);
});

/**
 * A host pinned to whole-pixel coordinates. Two controls compared pixel for pixel must sit at the
 * same sub-pixel offset, or their anti-aliased edges differ and an unchanged paint reads as a change.
 */
const addHost = (left: number, top: number): HTMLElement => {
    const host = document.createElement('div');
    host.style.cssText = `position:absolute;left:${left}px;top:${top}px`;
    document.body.append(host);
    hosts.push(host);
    return host;
};

// Hosts fill a 3 × 7 grid, one cell each, so no two screenshots overlap; the right edge holds blanks.
let slot = 0;
const nextHost = (): HTMLElement => {
    if (slot >= 21) throw new Error('out of host slots');
    const host = addHost(8 + Math.floor(slot / 7) * 230, 8 + (slot % 7) * 64);
    slot++;
    // Room for a cue drawn outside the control's own box (an outline); see hostOf.
    host.style.padding = '6px';
    host.dataset.paintHost = '';
    return host;
};

/** The padded host around a control: the screenshot that also holds what paints outside its box. */
const hostOf = (control: Element): Element => {
    const host = control.closest('[data-paint-host]');
    if (!host) throw new Error('control is not in a paint host');
    return host;
};

const decode = async (element: Element): Promise<ImageData> => {
    // A control whose state lands after insertion is mid-transition; let every ease settle first.
    await Promise.all(document.getAnimations().map((animation) => animation.finished));
    const base64 = await page.screenshot({element, save: false});
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height);
};

/** A channel step a viewer can see; smaller steps are anti-aliasing residue. */
const PERCEPTIBLE = 32;

/** Pixels whose colour differs perceptibly between two equally sized screenshots, out of all. */
const differing = async (a: Element, b: Element): Promise<{count: number; total: number}> => {
    const [left, right] = await Promise.all([decode(a), decode(b)]);
    expect([left.width, left.height]).toEqual([right.width, right.height]);
    const total = left.width * left.height;
    expect(total).toBeGreaterThan(0);
    let count = 0;
    for (let i = 0; i < left.data.length; i += 4) {
        const delta = Math.max(
            Math.abs(left.data[i] - right.data[i]),
            Math.abs(left.data[i + 1] - right.data[i + 1]),
            Math.abs(left.data[i + 2] - right.data[i + 2]),
        );
        if (delta >= PERCEPTIBLE) count++;
    }
    return {count, total};
};

/** A state counts as visible when at least a quarter of the control box paints differently. */
const VISIBLE = 0.25;

const expectVisiblyDifferent = async (a: Element, b: Element): Promise<void> => {
    const {count, total} = await differing(a, b);
    expect.soft(count / total, `${count} of ${total} pixels differ`).toBeGreaterThan(VISIBLE);
};

const expectIdentical = async (a: Element, b: Element): Promise<void> => {
    const {count, total} = await differing(a, b);
    expect.soft(count, `${count} of ${total} pixels differ`).toBe(0);
};

/**
 * The invalid cue is a ring around the control, not a fill, so it is measured on the padded host and
 * held to a pixel floor rather than a share of the box: a ring covers a small share of a wide input.
 */
const RING = 60;

const expectRingDiffers = async (valid: Element, invalid: Element): Promise<void> => {
    const {count, total} = await differing(hostOf(valid), hostOf(invalid));
    expect.soft(count, `${count} of ${total} pixels differ`).toBeGreaterThanOrEqual(RING);
};

/** An empty box at the control's size and sub-pixel offset: its screenshot is the bare page. */
const blankBeside = (element: Element): HTMLElement => {
    const {left, top, width, height} = element.getBoundingClientRect();
    const blank = addHost(700 + (left % 1), top);
    blank.style.width = `${width}px`;
    blank.style.height = `${height}px`;
    return blank;
};

const mountCheckbox = async (props: Record<string, unknown>): Promise<Element> => {
    const {container} = await render(Checkbox, {
        container: nextHost(),
        props: {id: `cb-${slot}`, label: 'Agree', ...props},
    });
    const control = container.querySelector('.ui-check__control');
    if (!control) throw new Error('no .ui-check__control');
    return control;
};

const mountSwitch = async (props: Record<string, unknown>): Promise<Element> => {
    const {container} = await render(Switch, {
        container: nextHost(),
        props: {id: `sw-${slot}`, label: 'Notify', ...props},
    });
    const control = container.querySelector('.ui-switch__control');
    if (!control) throw new Error('no .ui-switch__control');
    return control;
};

/**
 * The first option of a two-option RadioGroup. `1` selects it, `2` selects its sibling, `null` leaves
 * the group without a selection — where every radio matches `:indeterminate`.
 */
const mountRadio = async (model: 1 | 2 | null, extra: Record<string, unknown> = {}): Promise<Element> => {
    const {container} = await render(RadioGroup, {
        container: nextHost(),
        props: {
            id: `rg-${slot}`,
            label: 'Fruit',
            optionLabel: 'name',
            options: [
                {id: 1, name: 'Mango'},
                {id: 2, name: 'Apricot'},
            ],
            modelValue: model,
            ...extra,
        },
    });
    const control = container.querySelector('.ui-check__control');
    if (!control) throw new Error('no radio control');
    return control;
};

describe.each<Mode>(['none', 'active'])('forced-colors: %s — the checked state is painted', (mode) => {
    it('the instrument reads two identical controls as identical', async () => {
        await setForcedColors(mode);
        const first = await mountCheckbox({modelValue: true});
        const second = await mountCheckbox({modelValue: true});
        expect(await differing(first, second)).toMatchObject({count: 0});
    });

    it('Checkbox: checked differs from unchecked', async () => {
        await setForcedColors(mode);
        const off = await mountCheckbox({modelValue: false});
        const on = await mountCheckbox({modelValue: true});
        await expectVisiblyDifferent(off, on);
    });

    it('Checkbox: indeterminate differs from unchecked', async () => {
        await setForcedColors(mode);
        const off = await mountCheckbox({modelValue: false});
        const mixed = await mountCheckbox({modelValue: false, indeterminate: true});
        await expectVisiblyDifferent(off, mixed);
    });

    it('RadioGroup: a selected option differs from an unselected one', async () => {
        await setForcedColors(mode);
        const off = await mountRadio(2);
        const on = await mountRadio(1);
        await expectVisiblyDifferent(off, on);
    });

    it('Switch: on differs from off, and both differ from the bare page', async () => {
        await setForcedColors(mode);
        const off = await mountSwitch({modelValue: false});
        const on = await mountSwitch({modelValue: true});
        await expectVisiblyDifferent(off, on);
        await expectVisiblyDifferent(blankBeside(on), on);
        await expectVisiblyDifferent(blankBeside(off), off);
    });

    it('disabled Checkbox and RadioGroup keep checked apart from unchecked', async () => {
        await setForcedColors(mode);
        await expectVisiblyDifferent(
            await mountCheckbox({modelValue: false, disabled: true}),
            await mountCheckbox({modelValue: true, disabled: true}),
        );
        await expectVisiblyDifferent(await mountRadio(2, {disabled: true}), await mountRadio(1, {disabled: true}));
    });

    it('disabled indeterminate Checkbox differs from disabled unchecked and from enabled indeterminate', async () => {
        await setForcedColors(mode);
        const mixed = await mountCheckbox({modelValue: false, indeterminate: true, disabled: true});
        await expectVisiblyDifferent(await mountCheckbox({modelValue: false, disabled: true}), mixed);
        await expectVisiblyDifferent(await mountCheckbox({modelValue: false, indeterminate: true}), mixed);
    });

    it('RadioGroup: an option of a group with no selection paints as unselected', async () => {
        await setForcedColors(mode);
        await expectIdentical(await mountRadio(2), await mountRadio(null));
        await expectIdentical(await mountRadio(2, {disabled: true}), await mountRadio(null, {disabled: true}));
        await expectVisiblyDifferent(await mountRadio(null), await mountRadio(1));
    });

    it('invalid differs from valid on TextInput, Checkbox, RadioGroup and Switch', async () => {
        await setForcedColors(mode);
        const text = async (invalid: boolean) => {
            const {container} = await render(TextInput, {
                container: nextHost(),
                props: {id: `ti-${slot}`, modelValue: 'Mango', invalid, 'aria-label': 'Fruit'},
            });
            const control = container.querySelector('.ui-control');
            if (!control) throw new Error('no .ui-control');
            return control;
        };
        await expectRingDiffers(await text(false), await text(true));
        await expectRingDiffers(
            await mountCheckbox({modelValue: false}),
            await mountCheckbox({modelValue: false, invalid: true}),
        );
        await expectRingDiffers(await mountRadio(2), await mountRadio(2, {invalid: true}));
        await expectRingDiffers(
            await mountSwitch({modelValue: false}),
            await mountSwitch({modelValue: false, invalid: true}),
        );
    });
});

// Forced colours only: the author palette paints a disabled switch faint on purpose (a white thumb
// on a near-white track; WCAG 1.4.11 exempts inactive controls), so the none mode has no positive
// control to offer for this one case. The forced palette must still draw the thumb where it stands.
it('forced-colors: active — a disabled Switch keeps on apart from off', async () => {
    await setForcedColors('active');
    await expectVisiblyDifferent(
        await mountSwitch({modelValue: false, disabled: true}),
        await mountSwitch({modelValue: true, disabled: true}),
    );
});
