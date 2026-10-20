// Browser-mode spec: Textarea's autogrow needs a real layout engine (happy-dom has no scrollHeight).
import {describe, expect, it} from 'vitest';
import {render} from 'vitest-browser-vue';
import {userEvent} from 'vitest/browser';
import {defineComponent, h, nextTick, ref} from 'vue';

import Textarea from '../../src/components/Textarea.vue';
import '../../styles.css';

const mountTextarea = async (initial: string, props: Record<string, unknown>) => {
    const model = ref<string | null>(initial);
    const screen = await render(
        defineComponent(
            () => () =>
                h('div', {style: 'width: 240px'}, [
                    h(Textarea, {
                        ...props,
                        modelValue: model.value,
                        'onUpdate:modelValue': (value: string | null) => (model.value = value),
                    }),
                ]),
        ),
    );
    await nextTick();
    return {model, textarea: screen.container.querySelector('textarea') as HTMLTextAreaElement};
};

const lines = (count: number): string => Array.from({length: count}, (_, i) => `line ${i + 1}`).join('\n');

describe('Textarea autogrow', () => {
    it('grows with the text and shrinks when lines are deleted', async () => {
        const {model, textarea} = await mountTextarea('', {autogrow: true, rows: 1});
        const one = textarea.offsetHeight;

        await userEvent.type(textarea, 'a{Enter}b{Enter}c{Enter}d');
        await nextTick();
        const four = textarea.offsetHeight;
        expect(four).toBeGreaterThan(one * 2);

        model.value = 'a';
        await nextTick();
        expect(textarea.offsetHeight).toBe(one);
    });

    it('fits prefilled text on mount, before any edit', async () => {
        const short = await mountTextarea('one line', {autogrow: true, rows: 1});
        const tall = await mountTextarea(lines(6), {autogrow: true, rows: 1});

        expect(tall.textarea.offsetHeight).toBeGreaterThan(short.textarea.offsetHeight * 3);
        expect(tall.textarea.scrollHeight).toBeLessThanOrEqual(tall.textarea.clientHeight);
    });

    it('stops at maxRows and scrolls from there', async () => {
        const capped = await mountTextarea(lines(12), {autogrow: true, rows: 1, maxRows: 3});
        const three = await mountTextarea(lines(3), {autogrow: true, rows: 1});

        expect(capped.textarea.offsetHeight).toBe(three.textarea.offsetHeight);
        expect(getComputedStyle(capped.textarea).overflowY).toBe('auto');
        expect(capped.textarea.scrollHeight).toBeGreaterThan(capped.textarea.clientHeight);
    });

    it('stays at its rows without autogrow, and offers no manual resize with it', async () => {
        const plain = await mountTextarea(lines(8), {rows: 2});
        const grown = await mountTextarea(lines(8), {rows: 2, autogrow: true});

        expect(plain.textarea.offsetHeight).toBeLessThan(grown.textarea.offsetHeight);
        expect(getComputedStyle(plain.textarea).resize).toBe('vertical');
        expect(getComputedStyle(grown.textarea).resize).toBe('none');
    });
});
