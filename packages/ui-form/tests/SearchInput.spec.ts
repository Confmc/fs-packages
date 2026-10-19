// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import SearchInput from '../src/components/SearchInput.vue';

const mountSearch = (props: Record<string, unknown> = {}) =>
    mount(SearchInput, {props: {modelValue: 'appel', ...props}, attachTo: document.body});

describe('SearchInput', () => {
    it('is a search box: shows the text, emits what is typed', async () => {
        const wrapper = mountSearch();
        const input = wrapper.find('input');

        expect(input.attributes('type')).toBe('search');
        expect(input.element.value).toBe('appel');
        await input.setValue('peer');
        expect(wrapper.emitted('update:modelValue')).toEqual([['peer']]);
        wrapper.unmount();
    });

    it("clears to '' with its clear button, keeping focus on the input", async () => {
        const wrapper = mountSearch();
        const clear = wrapper.find('.ui-input__clear');

        expect(clear.attributes('aria-label')).toBe('Clear');
        const down = new MouseEvent('mousedown', {cancelable: true});
        clear.element.dispatchEvent(down);
        expect(down.defaultPrevented).toBe(true);
        await clear.trigger('click');

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['']);
        expect(document.activeElement).toBe(wrapper.find('input').element);
        wrapper.unmount();
    });

    it.each([
        ['no text', {modelValue: ''}],
        ['null', {modelValue: null}],
        ['disabled', {disabled: true}],
        ['clearable false', {clearable: false}],
    ])('has no clear button with %s', (_, props) => {
        const wrapper = mountSearch(props);

        expect(wrapper.find('.ui-input__clear').exists()).toBe(false);
        wrapper.unmount();
    });

    it('names the clear button as asked, and focuses on mount with autofocus', () => {
        const wrapper = mountSearch({clearButtonLabel: 'Wis zoekterm', autofocus: true});

        expect(wrapper.find('.ui-input__clear').attributes('aria-label')).toBe('Wis zoekterm');
        expect(document.activeElement).toBe(wrapper.find('input').element);
        wrapper.unmount();
    });

    it('does not emit while an IME composes, as TextInput', async () => {
        const wrapper = mountSearch({modelValue: ''});
        const input = wrapper.find('input');

        await input.trigger('compositionstart');
        input.element.value = 'に';
        await input.trigger('input');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        await input.trigger('compositionend');
        expect(wrapper.emitted('update:modelValue')).toEqual([['に']]);
        wrapper.unmount();
    });

    it('puts class and style on the wrapper and every other attribute on the input', () => {
        const wrapper = mount(SearchInput, {
            props: {modelValue: ''},
            attrs: {class: 'w-60', 'aria-label': 'Zoek cliënt'},
        });

        expect(wrapper.classes()).toContain('w-60');
        expect(wrapper.find('input').attributes('aria-label')).toBe('Zoek cliënt');
    });
});
