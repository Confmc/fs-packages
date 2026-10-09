// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';
import {defineComponent, h, mergeProps, nextTick, ref} from 'vue';

import {TextInput, useForm} from '../../src';
import {readPath, writePath} from '../../src/form/path';

interface Draft {
    firstName: string | null;
    learningGoals: {title: string | null}[];
}

describe('useForm with a draft', () => {
    it('binds a control to the value at a path, nested and indexed, with no v-model', async () => {
        const draft = ref<Draft>({firstName: 'Ann', learningGoals: [{title: 'Lezen'}]});
        const wrapper = mount(
            defineComponent({
                setup: () => {
                    const {field} = useForm({draft});
                    return () =>
                        h('div', [h(TextInput, field('firstName')), h(TextInput, field('learningGoals.0.title'))]);
                },
            }),
        );
        const [name, title] = wrapper.findAll('input');

        expect(name!.element.value).toBe('Ann');
        expect(title!.element.value).toBe('Lezen');

        await title!.setValue('Schrijven');
        await name!.setValue('Bo');

        expect(draft.value).toEqual({firstName: 'Bo', learningGoals: [{title: 'Schrijven'}]});
        await nextTick();
        expect(wrapper.findAll('input')[1]!.element.value).toBe('Schrijven');
    });

    it('carries only the wiring without a draft', () => {
        let props: object = {};
        mount(
            defineComponent({
                setup: () => {
                    props = useForm().field('firstName');
                    return () => null;
                },
            }),
        );

        expect(Object.keys(props).sort()).toEqual(['describedby', 'error', 'id', 'invalid']);
    });

    it('next to a v-model, the v-model value shows, but a change is written to BOTH the v-model and the draft', async () => {
        // what `<TextInput v-bind="field('firstName')" v-model="other" />` compiles to
        const draft = ref<Draft>({firstName: 'Ann', learningGoals: []});
        const other = ref<string | null>('Other');
        const wrapper = mount(
            defineComponent({
                setup: () => {
                    const {field} = useForm({draft});
                    return () =>
                        h(
                            TextInput,
                            mergeProps(field('firstName'), {
                                modelValue: other.value,
                                'onUpdate:modelValue': (value: string | null) => (other.value = value),
                            }),
                        );
                },
            }),
        );

        expect(wrapper.find('input').element.value).toBe('Other');
        await wrapper.find('input').setValue('New');

        expect(other.value).toBe('New');
        expect(draft.value.firstName).toBe('New');
    });
});

describe('readPath / writePath', () => {
    it('reads a missing step as undefined', () => {
        expect(readPath({a: null}, 'a.b.c')).toBeUndefined();
        expect(readPath({a: [{b: 1}]}, 'a.0.b')).toBe(1);
    });

    it('writes a top-level key and a nested one', () => {
        const target = {a: 1, b: [{c: 1}]};
        writePath(target, 'a', 2);
        writePath(target, 'b.0.c', 3);

        expect(target).toEqual({a: 2, b: [{c: 3}]});
    });

    it('refuses loudly to write under a missing parent', () => {
        expect(() => writePath({a: null}, 'a.b', 1)).toThrow('[ui-form] cannot write "a.b": "a" is null');
        expect(() => writePath({}, 'a.0.b', 1)).toThrow('"a.0" is undefined');
    });
});
