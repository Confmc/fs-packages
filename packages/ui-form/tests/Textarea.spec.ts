// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';

import Textarea from '../src/components/Textarea.vue';

describe('Textarea', () => {
    it('renders a textarea reflecting the model and valid state', () => {
        const wrapper = mount(Textarea, {props: {id: 'notes', modelValue: 'hello'}});
        const textarea = wrapper.find('textarea');

        expect((textarea.element as HTMLTextAreaElement).value).toBe('hello');
        expect(textarea.classes()).toContain('ui-control');
        expect(textarea.classes()).toContain('ui-textarea');
        expect(textarea.classes()).not.toContain('is-invalid');
        expect(textarea.attributes('aria-invalid')).toBeUndefined();
        expect(textarea.attributes('aria-required')).toBeUndefined();
    });

    it('renders empty for a null model', () => {
        const wrapper = mount(Textarea, {props: {id: 'notes', modelValue: null}});
        expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('');
    });

    it('honours placeholder/rows/required/invalid/describedby', () => {
        const wrapper = mount(Textarea, {
            props: {
                id: 'notes',
                modelValue: 'hi',
                placeholder: 'Notes',
                rows: 4,
                required: true,
                invalid: true,
                describedby: 'notes-error',
            },
        });
        const textarea = wrapper.find('textarea');

        expect(textarea.attributes('placeholder')).toBe('Notes');
        expect(textarea.attributes('rows')).toBe('4');
        expect(textarea.classes()).toContain('is-invalid');
        expect(textarea.attributes('aria-invalid')).toBe('true');
        expect(textarea.attributes('aria-required')).toBe('true');
        expect(textarea.attributes('aria-describedby')).toBe('notes-error');
    });

    it('emits the text on input', async () => {
        const wrapper = mount(Textarea, {props: {id: 'notes', modelValue: null}});
        await wrapper.find('textarea').setValue('a note');
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['a note']);
    });

    it("emits '' when the textarea is cleared (raw native value; middleware maps to null)", async () => {
        const wrapper = mount(Textarea, {props: {id: 'notes', modelValue: 'hi'}});
        await wrapper.find('textarea').setValue('');
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['']);
    });

    it('renders the disabled attribute when disabled', () => {
        const wrapper = mount(Textarea, {props: {id: 'notes', disabled: true, modelValue: null}});
        expect(wrapper.find('textarea').attributes('disabled')).toBeDefined();
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Textarea autogrow (happy-dom: wiring only; the sizing is pinned in the browser suite)', () => {
    it('marks itself is-autogrow and sets its own height, only when asked', () => {
        const grown = mount(Textarea, {props: {modelValue: 'x', autogrow: true}});
        const plain = mount(Textarea, {props: {modelValue: 'x'}});

        expect(grown.find('textarea').classes()).toContain('is-autogrow');
        expect(grown.find('textarea').element.style.height).toMatch(/px$/);
        expect(plain.find('textarea').classes()).not.toContain('is-autogrow');
        expect(plain.find('textarea').element.style.height).toBe('');
    });

    // happy-dom has no layout, so these give the textarea measurements to size from.
    const measured = (scrollHeight: number, style: Partial<CSSStyleDeclaration>) => {
        vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            borderTopWidth: '1px',
            borderBottomWidth: '1px',
            paddingTop: '8px',
            paddingBottom: '8px',
            lineHeight: '20px',
            fontSize: '14px',
            ...style,
        } as CSSStyleDeclaration);
    };

    it('sizes to the content plus its borders, and caps at maxRows lines, scrolling past that', () => {
        measured(100, {});
        const free = mount(Textarea, {props: {modelValue: 'x', autogrow: true}});
        const capped = mount(Textarea, {props: {modelValue: 'x', autogrow: true, maxRows: 3}});

        expect(free.find('textarea').element.style.height).toBe('102px');
        expect(free.find('textarea').element.style.overflowY).toBe('hidden');
        // 3 lines of 20px, 16px padding, 2px border
        expect(capped.find('textarea').element.style.height).toBe('78px');
        expect(capped.find('textarea').element.style.overflowY).toBe('auto');
    });

    it("falls back to 1.2 × the font size for a 'normal' line height, and to 0 for an unset length", () => {
        measured(100, {lineHeight: 'normal', borderTopWidth: '', borderBottomWidth: ''});
        const capped = mount(Textarea, {props: {modelValue: 'x', autogrow: true, maxRows: 2}});

        // 2 × 16.8px + 16px padding, no border
        expect(capped.find('textarea').element.style.height).toBe('49.6px');
    });
});
