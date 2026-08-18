// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import Disclosure from '../src/components/Disclosure.vue';

const base = {id: 'details', label: 'Details'};

describe('Disclosure', () => {
    it('renders a real <button> trigger wired to the panel, collapsed by default', () => {
        const wrapper = mount(Disclosure, {props: base, slots: {default: '<p>Body</p>'}});
        const trigger = wrapper.find('button');
        const panel = wrapper.find('.ui-disclosure__panel');

        expect(trigger.attributes('type')).toBe('button');
        expect(trigger.attributes('id')).toBe('details');
        expect(trigger.text()).toBe('Details');
        expect(trigger.attributes('aria-expanded')).toBe('false');
        // aria-controls is an IDREF: it must resolve in BOTH states, so the panel is mounted and
        // hidden with v-show rather than removed with v-if. Nothing else catches a regression to
        // v-if — axe reports a dangling aria-controls as neither a violation nor an incomplete.
        expect(trigger.attributes('aria-controls')).toBe('details-panel');
        expect(panel.attributes('id')).toBe('details-panel');
        expect(panel.html()).toContain('<p>Body</p>');
        // happy-dom's getComputedStyle ignores inline styles on a detached mount, so isVisible()
        // can never fail here — assert the v-show declaration itself.
        expect((panel.element as HTMLElement).style.display).toBe('none');
    });

    it('the HEADING contains the button — it never behaves as one', () => {
        const wrapper = mount(Disclosure, {props: {...base, headingLevel: 2}});
        const heading = wrapper.find('h2');

        expect(heading.exists()).toBe(true);
        expect(heading.classes()).toContain('ui-disclosure__header');
        // The live defect this replaces is `<h2 @click="collapse?.toggle">`: the heading itself
        // must carry no role, no tabindex and no activation — the button inside it does.
        expect(heading.attributes('role')).toBeUndefined();
        expect(heading.attributes('tabindex')).toBeUndefined();
        expect(heading.element.firstElementChild?.tagName).toBe('BUTTON');
        expect(heading.findAll('button')).toHaveLength(1);
    });

    it('renders a plain, outline-neutral wrapper when no headingLevel is given', () => {
        const wrapper = mount(Disclosure, {props: base});
        const header = wrapper.find('.ui-disclosure__header');

        expect(header.element.tagName).toBe('DIV');
        expect(wrapper.findAll('h1, h2, h3, h4, h5, h6')).toHaveLength(0);
    });

    it('honours every heading level it advertises', () => {
        for (const level of [1, 2, 3, 4, 5, 6] as const) {
            const wrapper = mount(Disclosure, {props: {...base, headingLevel: level}});
            expect(wrapper.find(`h${level}`).exists()).toBe(true);
        }
    });

    it('toggles aria-expanded and the panel, uncontrolled, with no v-model bound', async () => {
        const wrapper = mount(Disclosure, {props: base, slots: {default: '<p>Body</p>'}});
        const trigger = wrapper.find('button');
        const panel = () => wrapper.find('.ui-disclosure__panel').element as HTMLElement;

        await trigger.trigger('click');
        expect(trigger.attributes('aria-expanded')).toBe('true');
        expect(panel().style.display).toBe('');

        await trigger.trigger('click');
        expect(trigger.attributes('aria-expanded')).toBe('false');
        expect(panel().style.display).toBe('none');
    });

    it('round-trips a bound v-model:expanded', async () => {
        const wrapper = mount(Disclosure, {props: {...base, expanded: true}});
        expect(wrapper.find('button').attributes('aria-expanded')).toBe('true');

        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('update:expanded')?.at(-1)).toEqual([false]);

        await wrapper.setProps({expanded: false});
        expect(wrapper.find('button').attributes('aria-expanded')).toBe('false');
    });

    it('renders the chevron as decoration only, keyed on the ARIA state', () => {
        const wrapper = mount(Disclosure, {props: base});
        const chevron = wrapper.find('.ui-disclosure__chevron');

        expect(chevron.exists()).toBe(true);
        expect(chevron.attributes('aria-hidden')).toBe('true');
    });

    it('lets the trigger slot override the label, and keeps the chevron outside it', () => {
        const wrapper = mount(Disclosure, {props: base, slots: {trigger: '<span class="rich">Rich trigger</span>'}});

        expect(wrapper.find('.rich').text()).toBe('Rich trigger');
        expect(wrapper.text()).not.toContain('Details');
        expect(wrapper.find('.ui-disclosure__chevron').exists()).toBe(true);
    });

    it('renders disabled and ignores a click reaching the handler anyway', async () => {
        const wrapper = mount(Disclosure, {props: {...base, disabled: true}});
        const trigger = wrapper.find('button');

        expect(trigger.attributes('disabled')).toBeDefined();
        // Dispatch from INSIDE the disabled button so the event bubbles up to the handler: VTU's
        // trigger() — and a dispatch on the button itself — are both suppressed on a disabled
        // control, which would leave the guard unexercised (the vacuous-assertion trap). What a
        // real browser suppresses is the user gesture; a programmatic dispatch is what this guard
        // is actually for.
        wrapper.find('.ui-disclosure__chevron').element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(trigger.attributes('aria-expanded')).toBe('false');
    });

    it('re-aims attrs at the trigger button, not the wrapper root', () => {
        const wrapper = mount(Disclosure, {props: base, attrs: {'data-test': 'details', title: 'More'}});

        expect(wrapper.find('button').attributes('data-test')).toBe('details');
        expect(wrapper.find('button').attributes('title')).toBe('More');
        expect(wrapper.element.getAttribute('data-test')).toBeNull();
    });
});
