// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';

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
        // Native dispatch — a real browser fires no click on a disabled button, so the guard would
        // otherwise sit unexercised (the vacuous-assertion trap).
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
        // A <div> has no native `disabled`, so .is-disabled carries the CSS pointer-events block.
        expect(wrapper.classes()).toContain('is-disabled');

        key(wrapper.element, 'keydown', 'Enter');
        key(wrapper.element, 'keydown', ' ');
        key(wrapper.element, 'keyup', ' ');
        expect(onClick).not.toHaveBeenCalled();
        expect(wrapper.emitted('update:pressed')).toBeUndefined();

        // The pointer block on the fallback path is CSS-only, so a dispatched click DOES reach the
        // element — and the guard has to stop the consumer's own fall-through handler too, not
        // just our toggle. An early return cannot do that; `stopImmediatePropagation` can.
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
