// Browser-mode CONTRACT spec (real Chromium) — scope: contract + interaction only; unit
// behaviour stays in the happy-dom suite; never duplicate a happy-dom spec here.
//
// First-ever coverage of styles.css: the shipped stylesheet applied in a real layout engine,
// asserted through getComputedStyle — the layer no happy-dom spec can see. Includes the
// WR-0512 regression pins (font-size source-order fight) and the state-variant hooks on a
// real keyboard :focus-visible.
import {afterEach, describe, expect, it} from 'vitest';
import {cdp, userEvent} from 'vitest/browser';

// `?inline` yields the stylesheet as text so each test controls WHERE in the cascade the
// package sheet sits — the WR-0512 pins need both orderings, which a plain side-effect
// import (one fixed <style> position) cannot express.
import uiCss from '../../styles.css?inline';

const cleanupTargets: Element[] = [];

/** Append a stylesheet at the CURRENT end of <head> — later calls sit later in the cascade. */
const addStyle = (css: string): void => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    cleanupTargets.push(style);
};

/** A bare `<input class="ui-control">` inside a parent div (for inheritance assertions). */
const addControl = (parentStyle = ''): HTMLInputElement => {
    const parent = document.createElement('div');
    if (parentStyle) parent.setAttribute('style', parentStyle);
    const control = document.createElement('input');
    control.className = 'ui-control';
    parent.append(control);
    document.body.append(parent);
    cleanupTargets.push(parent);
    return control;
};

afterEach(() => {
    for (const el of cleanupTargets.splice(0)) el.remove();
    document.documentElement.removeAttribute('style');
});

describe('styles.css — resting defaults', () => {
    it('renders the documented resting --ui-* defaults on .ui-control', () => {
        addStyle(uiCss);
        const control = addControl();
        const computed = getComputedStyle(control);

        expect(computed.backgroundColor).toBe('rgb(255, 255, 255)'); // --ui-control-bg
        expect(computed.color).toBe('rgb(17, 24, 39)'); // --ui-control-text
        expect(computed.borderTopWidth).toBe('1px'); // --ui-control-border-width
        expect(computed.borderTopColor).toBe('rgb(209, 213, 219)'); // --ui-control-border-color
        expect(computed.borderTopLeftRadius).toBe('8px'); // --ui-control-radius
        expect(computed.boxShadow).toBe('none'); // --ui-control-shadow
    });

    it('renders the documented resting defaults on .ui-label and .ui-error', () => {
        addStyle(uiCss);
        const label = document.createElement('label');
        label.className = 'ui-label';
        const error = document.createElement('p');
        error.className = 'ui-error';
        document.body.append(label, error);
        cleanupTargets.push(label, error);

        expect(getComputedStyle(label).color).toBe('rgb(55, 65, 81)'); // --ui-label-color
        expect(getComputedStyle(label).fontSize).toBe('14px'); // --ui-label-size 0.875rem
        expect(getComputedStyle(error).color).toBe('rgb(220, 38, 38)'); // --ui-danger-text
        expect(getComputedStyle(error).fontSize).toBe('13px'); // --ui-error-size 0.8125rem
    });
});

describe('styles.css — :root overrides (the --ui-* contract)', () => {
    it('overriding --ui-* vars on :root changes computed values', () => {
        addStyle(uiCss);
        const control = addControl();

        document.documentElement.style.setProperty('--ui-control-bg', 'rgb(1, 2, 3)');
        document.documentElement.style.setProperty('--ui-control-border-color', 'rgb(4, 5, 6)');
        document.documentElement.style.setProperty('--ui-control-radius', '3px');

        const computed = getComputedStyle(control);
        expect(computed.backgroundColor).toBe('rgb(1, 2, 3)');
        expect(computed.borderTopColor).toBe('rgb(4, 5, 6)');
        expect(computed.borderTopLeftRadius).toBe('3px');
    });

    it('accepts a border-width SHORTHAND value (`0 0 1px` — the isms underline idiom)', () => {
        addStyle(uiCss);
        const control = addControl();
        document.documentElement.style.setProperty('--ui-control-border-width', '0 0 1px');

        const computed = getComputedStyle(control);
        expect(computed.borderTopWidth).toBe('0px');
        expect(computed.borderRightWidth).toBe('0px');
        expect(computed.borderLeftWidth).toBe('0px');
        expect(computed.borderBottomWidth).toBe('1px');
    });

    it('overriding --ui-menu-* vars changes the shared listbox popup', () => {
        addStyle(uiCss);
        const menu = document.createElement('ul');
        menu.className = 'ui-select__menu';
        document.body.append(menu);
        cleanupTargets.push(menu);

        expect(getComputedStyle(menu).maxHeight).toBe('240px'); // --ui-menu-max-height 15rem
        document.documentElement.style.setProperty('--ui-menu-max-height', '100px');
        expect(getComputedStyle(menu).maxHeight).toBe('100px');
    });
});

describe('styles.css — WR-0512 font-size source-order regression pins', () => {
    it('the default reproduces the historical `font: inherit` (control text follows the parent)', () => {
        addStyle(uiCss);
        const control = addControl('font-size: 18px');
        expect(getComputedStyle(control).fontSize).toBe('18px');
    });

    it('pins the trap: a declaration utility EARLIER in source order silently loses to the package sheet', () => {
        // Utility first, package sheet last — the arrangement WR-0512 documented: both
        // selectors are one class (0,1,0), so the later sheet wins the tie and the
        // utility's font-size silently vanishes under the package's font reset.
        addStyle('.text-sm { font-size: 13px; }');
        addStyle(uiCss);
        const control = addControl('font-size: 18px');
        control.classList.add('text-sm');

        expect(getComputedStyle(control).fontSize).toBe('18px');
    });

    it('the --ui-control-font-size var wins by contract, regardless of source order', () => {
        // The escape hatch WR-0511/WR-0512 shipped: the utility sets the VAR the package
        // rule reads instead of fighting the declaration tie — so it survives even when the
        // package sheet comes last (where a plain font-size utility loses, pinned above).
        addStyle('.size-sm { --ui-control-font-size: 13px; }');
        addStyle(uiCss);
        const control = addControl('font-size: 18px');
        control.classList.add('size-sm');

        expect(getComputedStyle(control).fontSize).toBe('13px');
    });

    it('the same declaration utility LATER in source order wins — order-dependence is what makes the trap silent', () => {
        addStyle(uiCss);
        addStyle('.text-sm { font-size: 13px; }');
        const control = addControl('font-size: 18px');
        control.classList.add('text-sm');

        expect(getComputedStyle(control).fontSize).toBe('13px');
    });
});

describe('styles.css — state-variant hooks on real states', () => {
    it('focus hooks fire on real keyboard :focus-visible', async () => {
        addStyle(uiCss);
        // Kill the 0.12s box-shadow/border-color transition for THIS test: the hooks under
        // test are the state-variant declarations, not the transition, and synchronous reads
        // are what turned the old intermittent poll timeout into a hard, diagnosable failure —
        // which exposed its true cause as the hover-masks-ring specificity defect (regression
        // test below), keyed on where earlier spec files happened to park the virtual mouse.
        addStyle('.ui-control { transition: none !important; }');
        const control = addControl();
        document.documentElement.style.setProperty('--ui-control-bg-focus', 'rgb(10, 20, 30)');
        document.documentElement.style.setProperty('--ui-control-text-focus', 'rgb(3, 4, 5)');
        document.documentElement.style.setProperty('--ui-control-border-color-focus', 'rgb(7, 8, 9)');
        document.documentElement.style.setProperty('--ui-control-border-width-focus', '3px');

        expect(getComputedStyle(control).backgroundColor).toBe('rgb(255, 255, 255)');

        // Real keyboard focus (Tab), not element.focus() — :focus-visible must match.
        await userEvent.tab();
        expect(document.activeElement).toBe(control);

        const focused = getComputedStyle(control);
        expect(focused.backgroundColor).toBe('rgb(10, 20, 30)');
        expect(focused.color).toBe('rgb(3, 4, 5)');
        expect(focused.borderTopWidth).toBe('3px');
        // Transition disabled above — border-color and box-shadow are synchronous too.
        expect(focused.borderTopColor).toBe('rgb(7, 8, 9)');
        expect(focused.boxShadow).not.toBe('none'); // --ui-focus-ring applied
    });

    it('the focus ring survives a pointer resting on the control — hover must not mask :focus-visible', async () => {
        addStyle(uiCss);
        addStyle('.ui-control { transition: none !important; }');
        const control = addControl();

        control.focus(); // a text input matches :focus-visible on ANY focus in Chromium
        expect(document.activeElement).toBe(control);
        expect(getComputedStyle(control).boxShadow).not.toBe('none'); // ring present

        // Park the real (CDP) mouse over the focused control: hover's box-shadow declaration
        // defaults to none, and at its old (0,3,0) specificity it beat the (0,2,0) focus rule —
        // silently stripping the keyboard focus ring (and the .is-open/.is-invalid shadows)
        // whenever the pointer rested on the control. The :where() fix keeps hover at (0,2,0)
        // so the later state rules win the tie.
        await userEvent.hover(control);
        expect(getComputedStyle(control).boxShadow).not.toBe('none'); // ring survives hover
    });

    it('focus hooks are a no-op until a territory opts in (defaults chain to the resting vars)', async () => {
        addStyle(uiCss);
        const control = addControl();

        await userEvent.tab();
        expect(document.activeElement).toBe(control);

        const focused = getComputedStyle(control);
        expect(focused.backgroundColor).toBe('rgb(255, 255, 255)'); // --ui-control-bg-focus → --ui-control-bg
        expect(focused.color).toBe('rgb(17, 24, 39)'); // --ui-control-text-focus → --ui-control-text
        expect(focused.borderTopWidth).toBe('1px'); // --ui-control-border-width-focus → resting width
    });

    it('.is-invalid keys on the danger vars and honors the bg/text invalid hooks', () => {
        addStyle(uiCss);
        const control = addControl();
        control.classList.add('is-invalid');

        expect(getComputedStyle(control).borderTopColor).toBe('rgb(220, 38, 38)'); // --ui-danger-border
        expect(getComputedStyle(control).backgroundColor).toBe('rgb(255, 255, 255)'); // hook no-op by default

        document.documentElement.style.setProperty('--ui-control-bg-invalid', 'rgb(9, 9, 9)');
        document.documentElement.style.setProperty('--ui-control-text-invalid', 'rgb(8, 7, 6)');
        expect(getComputedStyle(control).backgroundColor).toBe('rgb(9, 9, 9)');
        expect(getComputedStyle(control).color).toBe('rgb(8, 7, 6)');
    });

    it('a disabled control renders the disabled background and not-allowed cursor', () => {
        addStyle(uiCss);
        const control = addControl();
        control.disabled = true;

        expect(getComputedStyle(control).backgroundColor).toBe('rgb(243, 244, 246)'); // --ui-control-bg-disabled
        expect(getComputedStyle(control).color).toBe('rgb(107, 114, 128)'); // --ui-control-text-muted
        expect(getComputedStyle(control).cursor).toBe('not-allowed');
    });
});

/** The bare check chassis (label.ui-check > span.ui-check__control > input.ui-check__input). */
const addCheck = (radio = false): HTMLInputElement => {
    const row = document.createElement('label');
    row.className = 'ui-check';
    const holder = document.createElement('span');
    holder.className = 'ui-check__control';
    const input = document.createElement('input');
    input.type = radio ? 'radio' : 'checkbox';
    input.className = radio ? 'ui-check__input ui-radio__input' : 'ui-check__input';
    holder.append(input);
    row.append(holder);
    document.body.append(row);
    cleanupTargets.push(row);
    return input;
};

describe('styles.css — checkbox family (--ui-check-* / --ui-switch-*)', () => {
    it('renders the check chassis defaults, chained to the resting control tokens', async () => {
        addStyle(uiCss);
        const input = addCheck();
        const computed = getComputedStyle(input);

        expect(computed.appearance).toBe('none'); // native input restyled, never a div-with-role
        expect(computed.width).toBe('18px'); // --ui-check-size 1.125rem
        expect(computed.height).toBe('18px');
        expect(computed.borderTopWidth).toBe('1px'); // --ui-check-border-width → --ui-control-border-width
        expect(computed.borderTopColor).toBe('rgb(209, 213, 219)'); // → --ui-control-border-color
        expect(computed.borderTopLeftRadius).toBe('4px'); // --ui-check-radius
        expect(computed.backgroundColor).toBe('rgb(255, 255, 255)'); // --ui-check-bg → --ui-control-bg

        // :checked keys on --ui-check-bg-checked, defaulting to --ui-control-border-open.
        // Background sits in the chassis's 0.12s transition — poll past it.
        input.checked = true;
        await expect.poll(() => getComputedStyle(input).backgroundColor).toBe('rgb(37, 99, 235)');

        // The radio variant is the same chassis, rounded.
        expect(getComputedStyle(addCheck(true)).borderTopLeftRadius).toBe('50%');
    });

    it('honors --ui-check-* overrides, including a border-width SHORTHAND (the underline idiom)', async () => {
        addStyle(uiCss);
        const input = addCheck();
        document.documentElement.style.setProperty('--ui-check-size', '24px');
        document.documentElement.style.setProperty('--ui-check-border-width', '0 0 2px');
        document.documentElement.style.setProperty('--ui-check-bg-checked', 'rgb(1, 2, 3)');

        const computed = getComputedStyle(input);
        expect(computed.width).toBe('24px');
        expect(computed.borderBottomWidth).toBe('2px');
        expect(computed.borderTopWidth).toBe('0px');

        input.checked = true;
        await expect.poll(() => getComputedStyle(input).backgroundColor).toBe('rgb(1, 2, 3)');
    });

    it('renders the switch track geometry and travels the thumb by track-width − track-height', async () => {
        addStyle(uiCss);
        const row = document.createElement('label');
        row.className = 'ui-switch';
        const holder = document.createElement('span');
        holder.className = 'ui-switch__control';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'ui-switch__input';
        const thumb = document.createElement('span');
        thumb.className = 'ui-switch__thumb';
        holder.append(input, thumb);
        row.append(holder);
        document.body.append(row);
        cleanupTargets.push(row);

        const track = getComputedStyle(input);
        expect(track.width).toBe('36px'); // --ui-switch-track-width 2.25rem
        expect(track.height).toBe('20px'); // --ui-switch-track-height 1.25rem
        expect(track.backgroundColor).toBe('rgb(209, 213, 219)'); // --ui-switch-track-bg → border-color token

        // Resting thumb: 14px (--ui-switch-thumb-size 0.875rem), vertically centred.
        expect(getComputedStyle(thumb).width).toBe('14px');
        expect(getComputedStyle(thumb).transform).toBe('matrix(1, 0, 0, 1, 0, -7)');

        input.checked = true;
        // --ui-switch-track-bg-checked; background and transform both ride 0.12s transitions.
        await expect.poll(() => getComputedStyle(input).backgroundColor).toBe('rgb(37, 99, 235)');
        // Travel = 36 − 20 = 16px.
        await expect.poll(() => getComputedStyle(thumb).transform).toBe('matrix(1, 0, 0, 1, 16, -7)');
    });
});

/** A bare `<input class="ui-switch__input">` — the switch track chassis, focusable. */
const addSwitchInput = (): HTMLInputElement => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'ui-switch__input';
    document.body.append(input);
    cleanupTargets.push(input);
    return input;
};

// WR-0587 F-1. Every focusable control sets `outline: none` and conveys focus through
// box-shadow (--ui-focus-ring). Forced-colors mode STRIPS box-shadow, so keyboard focus goes
// invisible family-wide. The fix is a `@media (forced-colors: active)` block restoring a real
// outline on every focus surface. Emulated here through CDP (Emulation.setEmulatedMedia) —
// getComputedStyle then reflects the forced-colors cascade in a real engine, which no static
// text scan can prove. Reset in afterEach so forced-colors never leaks into the serial siblings.
describe('styles.css — forced-colors keyboard focus (WR-0587 F-1)', () => {
    afterEach(async () => {
        await cdp().send('Emulation.setEmulatedMedia', {features: []});
    });

    const enableForcedColors = () =>
        cdp().send('Emulation.setEmulatedMedia', {features: [{name: 'forced-colors', value: 'active'}]});

    it('restores a visible outline on a focused .ui-control (box-shadow ring is not enough in forced-colors)', async () => {
        addStyle(uiCss);
        const control = addControl();
        await enableForcedColors();

        control.focus(); // a text input matches :focus-visible on any focus in Chromium
        expect(document.activeElement).toBe(control);

        const focused = getComputedStyle(control);
        // The restored outline — the load-bearing indicator once box-shadow is stripped.
        expect(focused.outlineStyle).toBe('solid');
        expect(focused.outlineWidth).toBe('2px');
    });

    it('restores the outline on the MultiSelect / MultiCombobox box (:focus-within) and the check + switch inputs (:focus-visible)', async () => {
        addStyle(uiCss);

        // MultiSelect box carries focus via :focus-within on the box, not the inner trigger.
        const msBox = document.createElement('div');
        msBox.className = 'ui-multiselect__box';
        msBox.tabIndex = 0;
        const mcBox = document.createElement('div');
        mcBox.className = 'ui-multicombobox__box';
        mcBox.tabIndex = 0;
        document.body.append(msBox, mcBox);
        cleanupTargets.push(msBox, mcBox);

        const check = addCheck();
        const sw = addSwitchInput();

        await enableForcedColors();

        for (const el of [msBox, mcBox, check, sw]) {
            el.focus();
            expect(document.activeElement).toBe(el);
            const s = getComputedStyle(el);
            expect(s.outlineStyle).toBe('solid');
            expect(s.outlineWidth).toBe('2px');
        }
    });
});

// WR-0587 F-7. The stylesheet declares seven 0.12s transitions with no reduced-motion gate.
// The fix is a `@media (prefers-reduced-motion: reduce)` block zeroing them. Emulated through
// CDP so getComputedStyle reports the gated transition in a real engine.
describe('styles.css — reduced-motion gate (WR-0587 F-7)', () => {
    afterEach(async () => {
        await cdp().send('Emulation.setEmulatedMedia', {features: []});
    });

    it('zeroes every declared transition under prefers-reduced-motion: reduce', async () => {
        addStyle(uiCss);
        const control = addControl();
        const check = addCheck();

        // Baseline: the eases are present (no reduced-motion preference).
        expect(getComputedStyle(control).transitionDuration).not.toBe('0s');
        expect(getComputedStyle(check).transitionDuration).not.toBe('0s');

        await cdp().send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});

        expect(getComputedStyle(control).transitionDuration).toBe('0s');
        expect(getComputedStyle(check).transitionDuration).toBe('0s');
    });
});
