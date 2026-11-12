// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';
import {h} from 'vue';

import OptionList from '../src/components/OptionList.vue';

const LABELS = ['Apricot', 'Banana', 'Cherry', 'Damson'];

const mountList = (props: Record<string, unknown> = {}) =>
    mount(OptionList, {
        props: {
            keys: LABELS,
            pointer: -1,
            listboxId: 'fruit-listbox',
            optionId: (index: number) => `fruit-opt-${index}`,
            isSelected: () => false,
            isMuted: () => false,
            optionsLabel: 'Fruits',
            emptyText: 'No fruit',
            ...props,
        },
        slots: {option: ({index}: {index: number}) => h('span', LABELS[index])},
    });

const texts = (elements: {text: () => string}[]) => elements.map((element) => element.text());

describe('OptionList', () => {
    it('renders every option in the listbox, in order', () => {
        const wrapper = mountList();
        const listbox = wrapper.find('[role="listbox"]');

        expect(listbox.attributes('id')).toBe('fruit-listbox');
        expect(listbox.attributes('aria-label')).toBe('Fruits');
        expect(listbox.classes()).toContain('ui-select__menu');
        expect(texts(wrapper.findAll('[role="listbox"] > [role="option"]'))).toEqual(LABELS);
        expect(wrapper.findAll('[role="option"]').map((option) => option.attributes('id'))).toEqual([
            'fruit-opt-0',
            'fruit-opt-1',
            'fruit-opt-2',
            'fruit-opt-3',
        ]);
    });

    it('emits hover and commit with the index of an option', async () => {
        const wrapper = mountList();
        const option = wrapper.find('#fruit-opt-1');

        await option.trigger('mouseover');
        await option.trigger('click');

        expect(wrapper.emitted('hover')).toEqual([[1]]);
        expect(wrapper.emitted('commit')).toEqual([[1]]);
    });

    it('cancels the mousedown on every option row and the clear entry, never on the listbox', () => {
        // The default a row cancels is the focus move onto the body; happy-dom performs none, so
        // this pins the mechanism. The listbox keeps its default: a scrollbar drag starts there.
        const wrapper = mountList({clearLabel: 'None', clearId: 'fruit-clear'});
        const mousedown = (element: Element): boolean => {
            vi.setSystemTime(Date.now() + 1);
            const event = new MouseEvent('mousedown', {bubbles: true, cancelable: true});
            element.dispatchEvent(event);
            return event.defaultPrevented;
        };

        expect(wrapper.findAll('[role="option"]').map((option) => mousedown(option.element))).toEqual([
            true,
            true,
            true,
            true,
            true,
        ]);
        expect(mousedown(wrapper.get('[role="listbox"]').element)).toBe(false);
    });

    it('marks the pointer active, the muted options muted and the committed option selected', () => {
        const wrapper = mountList({
            pointer: 1,
            isMuted: (index: number) => index === 2,
            isSelected: (index: number) => index === 0,
        });
        const options = wrapper.findAll('[role="option"]');

        expect(options.map((option) => option.classes('is-active'))).toEqual([false, true, false, false]);
        expect(options.map((option) => option.classes('is-muted'))).toEqual([false, false, true, false]);
        expect(options.map((option) => option.attributes('aria-selected'))).toEqual([
            'true',
            'false',
            'false',
            'false',
        ]);
    });

    it('shows the empty text as a disabled option with no options', () => {
        const wrapper = mountList({keys: []});
        const empty = wrapper.find('.ui-select__empty');

        expect(empty.text()).toBe('No fruit');
        expect(empty.attributes('role')).toBe('option');
        expect(empty.attributes('aria-disabled')).toBe('true');
    });

    it('shows no empty text while an option renders', () => {
        expect(mountList().find('.ui-select__empty').exists()).toBe(false);
    });

    describe('clear entry', () => {
        it('renders no entry without a clearLabel', () => {
            expect(mountList().find('.ui-select__clear').exists()).toBe(false);
        });

        it('renders the entry first, outside the index space, with its own id', () => {
            const wrapper = mountList({clearLabel: 'No fruit', clearId: 'fruit-clear'});
            const options = wrapper.findAll('[role="option"]');

            expect(options[0].attributes('id')).toBe('fruit-clear');
            expect(options[0].text()).toBe('No fruit');
            expect(options[0].attributes('aria-selected')).toBe('false');
            expect(options[0].classes('is-active')).toBe(false);
            expect(options[1].attributes('id')).toBe('fruit-opt-0');
        });

        it('marks the entry active and selected when told', () => {
            const wrapper = mountList({
                clearLabel: 'No fruit',
                clearId: 'fruit-clear',
                clearActive: true,
                clearSelected: true,
            });
            const entry = wrapper.find('#fruit-clear');

            expect(entry.classes('is-active')).toBe(true);
            expect(entry.attributes('aria-selected')).toBe('true');
        });

        it('emits clearHover and clearCommit, not hover and commit', async () => {
            const wrapper = mountList({clearLabel: 'No fruit', clearId: 'fruit-clear'});
            const entry = wrapper.find('#fruit-clear');

            await entry.trigger('mouseover');
            await entry.trigger('click');

            expect(wrapper.emitted('clearHover')).toHaveLength(1);
            expect(wrapper.emitted('clearCommit')).toHaveLength(1);
            expect(wrapper.emitted('hover')).toBeUndefined();
            expect(wrapper.emitted('commit')).toBeUndefined();
        });
    });
});
