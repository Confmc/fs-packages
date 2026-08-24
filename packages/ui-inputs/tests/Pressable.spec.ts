// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, ref} from 'vue';

import Pressable from '../src/components/Pressable.vue';

/** Dispatch a real, cancellable keyboard event — VTU's `trigger` cannot report defaultPrevented. */
const key = (element: Element, type: 'keydown' | 'keyup', value: string): KeyboardEvent => {
    const event = new KeyboardEvent(type, {key: value, bubbles: true, cancelable: true});
    element.dispatchEvent(event);
    return event;
};

describe('Pressable', () => {
    it('renders a real <button type="button"> by default, with its prop label', () => {
        const wrapper = mount(Pressable, {props: {label: 'Show example'}});

        // The whole point: a native button, never a <div role="button" tabindex="0">. Focusability,
        // Enter/Space activation and disabled semantics come from the platform.
        expect(wrapper.element.tagName).toBe('BUTTON');
        expect(wrapper.attributes('type')).toBe('button'); // never submits a surrounding form
        expect(wrapper.text()).toBe('Show example');
        expect(wrapper.classes()).toContain('ui-pressable');
        // No hand-rolled ARIA on the native path — the element already IS a button.
        expect(wrapper.attributes('role')).toBeUndefined();
        expect(wrapper.attributes('tabindex')).toBeUndefined();
    });

    it('lets the default slot override the prop label', () => {
        const wrapper = mount(Pressable, {props: {label: 'Plain'}, slots: {default: '<span>Rich</span>'}});
        expect(wrapper.text()).toBe('Rich');
    });

    it('sets NO aria-pressed until v-model:pressed is bound — a plain button is not a toggle', () => {
        const wrapper = mount(Pressable, {props: {label: 'Go'}});

        // Vue casts an absent Boolean prop to `false`; the model's `default: undefined` is what
        // stops that, and this is the assertion that catches its removal.
        expect(wrapper.attributes('aria-pressed')).toBeUndefined();
    });

    it('conveys and flips aria-pressed in toggle mode', async () => {
        const wrapper = mount(Pressable, {props: {label: 'Bold', pressed: false}});
        expect(wrapper.attributes('aria-pressed')).toBe('false');

        await wrapper.trigger('click');
        expect(wrapper.emitted('update:pressed')?.at(-1)).toEqual([true]);

        await wrapper.setProps({pressed: true});
        expect(wrapper.attributes('aria-pressed')).toBe('true');

        await wrapper.trigger('click');
        expect(wrapper.emitted('update:pressed')?.at(-1)).toEqual([false]);
    });

    it('renders disabled and ignores a click reaching the handler anyway', async () => {
        const wrapper = mount(Pressable, {props: {label: 'Go', disabled: true, pressed: false}});

        expect(wrapper.attributes('disabled')).toBeDefined();
        // Native dispatch — a real browser withholds a click on a disabled button only for USER
        // ACTIVATION, so this is the path a real consumer's handler can still be reached on
        // (`dispatchEvent` runs listeners on a disabled button in Chromium), and the guard is what
        // stops it rather than the browser.
        wrapper.element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('update:pressed')).toBeUndefined();
    });

    it('falls attrs through to the button — the root IS the interactive element, so nothing is re-aimed', () => {
        const wrapper = mount(Pressable, {props: {label: 'Go'}, attrs: {'aria-label': 'Show the example', id: 'ex'}});

        expect(wrapper.element.tagName).toBe('BUTTON');
        expect(wrapper.attributes('aria-label')).toBe('Show the example');
        expect(wrapper.attributes('id')).toBe('ex');
    });

    it('hand-rolls NO key handling on the native path — the browser already translates Enter/Space', () => {
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {props: {label: 'Go'}, attrs: {onClick}});

        // happy-dom does not synthesise the browser's key→click translation, so a click here could
        // only come from the component doing it a second time. (The REAL translation is proven in
        // the browser suite's keyboard walk.)
        key(wrapper.element, 'keydown', 'Enter');
        key(wrapper.element, 'keydown', ' ');
        key(wrapper.element, 'keyup', ' ');
        expect(onClick).not.toHaveBeenCalled();
    });
});

describe('Pressable — the discouraged `as` escape hatch', () => {
    it('applies role, tabindex and key handling TOGETHER (half a contract is worse than none)', () => {
        const wrapper = mount(Pressable, {props: {as: 'div', label: 'Row'}});

        expect(wrapper.element.tagName).toBe('DIV');
        expect(wrapper.attributes('role')).toBe('button');
        expect(wrapper.attributes('tabindex')).toBe('0');
        expect(wrapper.attributes('type')).toBeUndefined(); // `type` is meaningless off a button
        expect(wrapper.attributes('aria-disabled')).toBeUndefined();
    });

    it('Enter activates on keydown, dispatching a REAL click so fall-through handlers run too', () => {
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {props: {as: 'div', label: 'Row', pressed: false}, attrs: {onClick}});

        const event = key(wrapper.element, 'keydown', 'Enter');

        expect(event.defaultPrevented).toBe(true);
        expect(onClick).toHaveBeenCalledTimes(1); // the consumer's own handler, not just ours
        expect(wrapper.emitted('update:pressed')?.at(-1)).toEqual([true]);
    });

    it('Space activates on keyUP — keydown only arms it, and stops the page scroll', () => {
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {props: {as: 'div', label: 'Row'}, attrs: {onClick}});

        const down = key(wrapper.element, 'keydown', ' ');
        expect(down.defaultPrevented).toBe(true); // a bare Space would scroll
        expect(onClick).not.toHaveBeenCalled(); // …and must NOT have activated yet

        key(wrapper.element, 'keyup', ' ');
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('ignores other keys, and a keyup that our own keydown never armed', () => {
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {props: {as: 'div', label: 'Row'}, attrs: {onClick}});

        const other = key(wrapper.element, 'keydown', 'a');
        expect(other.defaultPrevented).toBe(false);

        key(wrapper.element, 'keyup', 'a'); // wrong key
        key(wrapper.element, 'keyup', ' '); // right key, never armed (focus arrived mid-press)
        expect(onClick).not.toHaveBeenCalled();
    });

    it('emulates disabled: out of the tab order, aria-disabled, and deaf to keys', async () => {
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {
            props: {as: 'div', label: 'Row', disabled: true, pressed: false},
            attrs: {onClick},
        });

        expect(wrapper.attributes('tabindex')).toBe('-1');
        expect(wrapper.attributes('aria-disabled')).toBe('true');
        // A <div> has no native `disabled`, so the state is mirrored as a class — which the
        // stylesheet reads for the muted colour and the not-allowed cursor, NOT for a pointer
        // block (see the `must not come back` pin in styles.browser.spec.ts).
        expect(wrapper.classes()).toContain('is-disabled');

        key(wrapper.element, 'keydown', 'Enter');
        key(wrapper.element, 'keydown', ' ');
        key(wrapper.element, 'keyup', ' ');
        expect(onClick).not.toHaveBeenCalled();
        expect(wrapper.emitted('update:pressed')).toBeUndefined();

        // The fallback stays in hit-testing, so a click DOES reach the element — and the guard has
        // to stop the consumer's own fall-through handler too, not just our toggle. An early
        // return cannot do that; `stopImmediatePropagation` can.
        wrapper.element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(onClick).not.toHaveBeenCalled();
        expect(wrapper.emitted('update:pressed')).toBeUndefined();
    });

    it('runs NOTHING when disabled — the fallback matches the native path it emulates', async () => {
        // Half a disabled contract is worse than none, so the two paths are asserted against each
        // other rather than separately: the browser refuses to dispatch on a disabled <button>,
        // and the hand-rolled emulation has to reach the same observable end state.
        const nativeClick = vi.fn();
        const native = mount(Pressable, {props: {label: 'Row', disabled: true}, attrs: {onClick: nativeClick}});
        native.element.dispatchEvent(new MouseEvent('click', {bubbles: true}));

        const fallbackClick = vi.fn();
        const fallback = mount(Pressable, {
            props: {as: 'div', label: 'Row', disabled: true},
            attrs: {onClick: fallbackClick},
        });
        fallback.element.dispatchEvent(new MouseEvent('click', {bubbles: true}));

        await Promise.all([native.vm.$nextTick(), fallback.vm.$nextTick()]);

        expect(nativeClick).not.toHaveBeenCalled();
        expect(fallbackClick).not.toHaveBeenCalled();
        expect(fallbackClick.mock.calls.length).toBe(nativeClick.mock.calls.length);
    });

    it('stops the fall-through handler because OUR handler is merged ahead of it', async () => {
        // The mechanism, pinned rather than trusted: `stopImmediatePropagation` only reaches
        // handlers that run AFTER it, so the guard works only while Vue keeps the component's own
        // template handler ahead of a fallthrough `onClick` in the merged array. A capture-phase
        // listener on the parent discriminates the two ways the consumer could stay silent —
        // it fires before the target either way, so seeing it prove the click was dispatched
        // while the consumer's handler stayed silent means our handler stopped it.
        const consumer = vi.fn();
        const captured = vi.fn();
        const wrapper = mount(Pressable, {
            attachTo: document.body,
            props: {as: 'div', label: 'Row', pressed: false},
            attrs: {onClick: consumer},
        });
        document.body.addEventListener('click', captured, true);

        try {
            wrapper.element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
            await wrapper.vm.$nextTick();
            expect(captured).toHaveBeenCalledTimes(1);
            expect(consumer).toHaveBeenCalledTimes(1); // enabled: ours toggled, theirs ran after

            await wrapper.setProps({disabled: true});
            wrapper.element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
            await wrapper.vm.$nextTick();

            expect(captured).toHaveBeenCalledTimes(2); // the click WAS dispatched…
            expect(consumer).toHaveBeenCalledTimes(1); // …and ours ran first and stopped the array
            expect(wrapper.emitted('update:pressed')).toHaveLength(1);
        } finally {
            document.body.removeEventListener('click', captured, true);
            wrapper.unmount();
        }
    });

    it('leaves a nested <input> its OWN spacebar — keys follow FOCUS, not the bubble path', () => {
        // A keyboard event targets the FOCUSED element and then bubbles, so an unguarded fallback
        // translates a child's keys as its own. Measured at HEAD before the fix: the keydown came
        // back `defaultPrevented` AND the row activated — a consumer's inline filter input inside a
        // clickable row could not type a space at all, and every attempt fired the row.
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {
            props: {as: 'div', label: 'Row'},
            attrs: {onClick},
            slots: {default: '<input class="nested" />'},
        });
        const nested = wrapper.element.querySelector('.nested')!;

        const down = key(nested, 'keydown', ' ');
        key(nested, 'keyup', ' ');

        expect(down.defaultPrevented).toBe(false); // the space reaches the text field
        expect(onClick).not.toHaveBeenCalled(); // …and does not activate the row
    });

    it('does not translate Enter from a nested <button> into an activation of its own', () => {
        // `defaultPrevented` is the load-bearing half, and the scope is narrower than the zero
        // below suggests: happy-dom performs no native Enter-to-click translation, so what this
        // pins is that the ROW's key handler stayed out of it. In a real browser the child's own
        // click then bubbles and the row does see one activation — the same one a mouse click
        // gives it, which the browser suite asserts as an equivalence. Suppressing the default is
        // exactly how the unguarded version stole the button's Enter outright (child handler
        // measured at 0), so an untouched event is what hands the job back to the browser.
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {
            props: {as: 'div', label: 'Row'},
            attrs: {onClick},
            slots: {default: '<button class="nested" type="button">Remove</button>'},
        });
        const nested = wrapper.element.querySelector('.nested')!;

        const down = key(nested, 'keydown', 'Enter');

        expect(down.defaultPrevented).toBe(false);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('does not activate on a Space keyup that landed in a CHILD after the root armed it', () => {
        // The keyup half of the guard, which the two cases above cannot reach: they never arm the
        // latch, because the child's own keydown is ignored. Arm it from the ROOT, then move focus
        // into a nested control before the release. A native button does not activate when focus
        // leaves mid-press either, so this is the reference the fallback emulates.
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {
            props: {as: 'div', label: 'Row'},
            attrs: {onClick},
            slots: {default: '<input class="nested" />'},
        });
        const nested = wrapper.element.querySelector('.nested')!;

        key(wrapper.element, 'keydown', ' '); // armed by the root…
        key(nested, 'keyup', ' '); // …released while a child holds focus
        expect(onClick).not.toHaveBeenCalled();

        // …and the latch is CLEARED by that keyup rather than left set, so the next release on the
        // root cannot activate on a press it never saw.
        key(wrapper.element, 'keyup', ' ');
        expect(onClick).not.toHaveBeenCalled();
    });

    it('POSITIVE CONTROL — the guard does not deafen the ROOT: Enter and Space still activate', () => {
        // Without this, every assertion above is equally consistent with a fallback that has
        // stopped responding to the keyboard altogether — which is the component's whole purpose.
        // Same fixture as the two cases above, carrying the same focusable child.
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {
            props: {as: 'div', label: 'Row'},
            attrs: {onClick},
            slots: {default: '<input class="nested" />'},
        });

        key(wrapper.element, 'keydown', 'Enter');
        expect(onClick).toHaveBeenCalledTimes(1);

        key(wrapper.element, 'keydown', ' ');
        key(wrapper.element, 'keyup', ' ');
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it('POSITIVE CONTROL — a click on a NON-focusable child still activates: clicks follow the POINTER', () => {
        // The asymmetry, pinned. A click targets the element under the pointer, so the ordinary
        // `<Pressable as="div"><span>Label</span></Pressable>` shape legitimately has
        // `target !== currentTarget`. Copying the key guard onto `onClick` "for consistency" would
        // break the most common use of the escape hatch, and this case is what says so.
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {
            props: {as: 'div', pressed: false},
            attrs: {onClick},
            slots: {default: '<span class="lbl">Label</span>'},
        });

        wrapper.element.querySelector('.lbl')!.dispatchEvent(new MouseEvent('click', {bubbles: true}));

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(wrapper.emitted('update:pressed')?.at(-1)).toEqual([true]);
    });

    it('clears the Space latch even when disabled interrupts the press mid-key', async () => {
        const onClick = vi.fn();
        const wrapper = mount(Pressable, {props: {as: 'div', label: 'Row'}, attrs: {onClick}});

        key(wrapper.element, 'keydown', ' '); // armed…
        await wrapper.setProps({disabled: true}); // …and the control is taken away before keyup

        key(wrapper.element, 'keyup', ' ');
        expect(onClick).not.toHaveBeenCalled(); // deaf while disabled

        await wrapper.setProps({disabled: false});
        // The keyup of the very press that was cancelled must not activate on re-enable, and
        // neither must the next one: the latch is cleared on every Space keyup, not only on the
        // ones that reach activation.
        key(wrapper.element, 'keyup', ' ');
        expect(onClick).not.toHaveBeenCalled();
    });
});

/**
 * The cost of "no `aria-pressed` until `v-model:pressed` is bound": `defineModel` cannot tell an
 * UNBOUND model from one bound to `undefined`, and `onClick` skips the assignment on `undefined`,
 * so a consumer who binds an uninitialised `ref<boolean>()` gets a control that silently never
 * toggles. The click semantics are deliberately left alone — toggling from `undefined` would make
 * an unbound Pressable start emitting and rendering `aria-pressed`, which is the contract above.
 * The fix is to make the silent case LOUD, and the discriminator is the listener a binding passes
 * alongside the prop. Asserted in both directions: a warning that fires on correct code would cost
 * the guard its authority.
 */
describe('Pressable — the uninitialised-model guard', () => {
    /** A host that binds a real `v-model:pressed`, so the compiler — not the spec — builds the props. */
    const ModelHost = defineComponent({
        props: {initial: {type: Boolean, default: undefined}},
        setup(props) {
            const pressed = ref<boolean | undefined>(props.initial);
            return () =>
                h(Pressable, {
                    pressed: pressed.value,
                    label: 'Bold',
                    'onUpdate:pressed': (value: boolean) => (pressed.value = value),
                });
        },
    });

    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('is the defect being reported: a bound model holding undefined never toggles or emits', async () => {
        const wrapper = mount(ModelHost);
        await wrapper.findComponent(Pressable).trigger('click');

        // Unchanged on purpose — this is the trade, not the bug. The warning is the fix.
        expect(wrapper.findComponent(Pressable).emitted('update:pressed')).toBeUndefined();
        expect(wrapper.findComponent(Pressable).attributes('aria-pressed')).toBeUndefined();
    });

    it('warns when a real v-model:pressed is bound to an uninitialised ref', () => {
        mount(ModelHost);

        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0]?.[0]);
        expect(message).toContain('<Pressable>');
        expect(message).toContain('v-model:pressed');
        expect(message).toContain('Initialise the bound ref to a boolean.');
    });

    it('warns on the hand-written `:pressed` + `@update:pressed` pair too — same discriminator', () => {
        mount(Pressable, {props: {label: 'Bold', pressed: undefined, 'onUpdate:pressed': vi.fn()}});

        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stays silent once the bound model holds a boolean — false is initialised, not absent', () => {
        mount(ModelHost, {props: {initial: false}});

        expect(warn).not.toHaveBeenCalled();
    });

    it('stays silent on an UNBOUND Pressable — the supported plain-action-button case', () => {
        mount(Pressable, {props: {label: 'Go'}});

        expect(warn).not.toHaveBeenCalled();
    });

    it('stays silent on `:pressed` with no listener — a prop without a binding is not a bound model', () => {
        // The listener, not the prop, is the discriminator: this consumer never asked to be told
        // about changes, so there is nothing uninitialised to complain about.
        mount(Pressable, {props: {label: 'Go', pressed: undefined}});

        expect(warn).not.toHaveBeenCalled();
    });

    it('is stripped in production, on the same gate as the accessible-name check', () => {
        vi.stubEnv('NODE_ENV', 'production');

        mount(ModelHost);

        expect(warn).not.toHaveBeenCalled();
    });
});
