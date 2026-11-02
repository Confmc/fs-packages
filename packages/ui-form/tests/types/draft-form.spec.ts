// @vitest-environment happy-dom
// useForm loads the form-bound FormLabel's SFC: under node it is compiled for SSR, a second copy the
// coverage report cannot merge with the one the component specs render.
// Type test (see path.spec.ts): useForm with a draft names its fields by the draft's paths.
import type {Ref} from 'vue';

import {describe, expectTypeOf, it} from 'vitest';
import {ref, shallowRef} from 'vue';

import type {Path, UseDraftForm, UseForm} from '../../src';

import {useForm} from '../../src/form/form';

interface Draft {
    firstName: string | null;
    born: Date;
    learningGoals: {title: string | null}[];
    parent: Draft | null;
}

const draft = ref<Draft>({firstName: null, born: new Date(), learningGoals: [], parent: null});

describe('useForm with a draft', () => {
    it('returns the form named by the draft paths', () => {
        expectTypeOf(useForm({draft})).toEqualTypeOf<UseDraftForm<Draft>>();
        // as the form named by the draft paths, but for field(), which also carries the value
        expectTypeOf<Omit<UseDraftForm<Draft>, 'field'>>().toEqualTypeOf<Omit<UseForm<Path<Draft>>, 'field'>>();
    });

    it('keys the errors by the draft paths, nested, indexed and through a nullable branch', () => {
        const {errors} = useForm({draft});

        expectTypeOf(errors.value.firstName).toEqualTypeOf<string | undefined>();
        expectTypeOf(errors.value['learningGoals.0.title']).toEqualTypeOf<string | undefined>();
        expectTypeOf(errors.value['parent.learningGoals.3.title']).toEqualTypeOf<string | undefined>();
        // @ts-expect-error not a path of the draft
        void errors.value.frstName;
        // @ts-expect-error a leaf's own members are not paths
        void errors.value['born.getTime'];
    });

    it('takes only draft paths in the fields allow-list', () => {
        useForm({draft, fields: ['firstName', 'learningGoals.0.title']});
        // @ts-expect-error not a path of the draft
        useForm({draft, fields: ['frstName']});
    });

    it('refuses a draft that is not a ref', () => {
        // @ts-expect-error the draft is the component's ref, not a plain object
        useForm({draft: draft.value});
        const options = {draft: draft.value, scrollToError: true};
        // @ts-expect-error the same from a variable, where no excess-property check would catch it
        useForm(options);
    });
});

describe('useForm without a draft', () => {
    it('names its fields by free strings, or by the union it is given', () => {
        expectTypeOf(useForm()).toEqualTypeOf<UseForm<string>>();
        expectTypeOf(useForm({fields: ['email', 'password']})).toEqualTypeOf<UseForm<'email' | 'password'>>();
        expectTypeOf(useForm<'email'>().errors.value).toEqualTypeOf<Partial<Record<'email', string>>>();
    });
});

describe('a helper generic over its draft', () => {
    it('gets the draft form from a Ref<D> without spelling out D', () => {
        const host = <D extends object>(model: Ref<D>): UseDraftForm<D> => useForm({draft: model});

        const form = host(draft);

        // From a `ref<Draft>`, a Ref<D> reads D as `Draft | UnwrapRef<Draft>` (the ref's getter and setter
        // types), which only TypeScript's identity check tells apart from Draft: the form fits both ways.
        expectTypeOf(form).toExtend<UseDraftForm<Draft>>();
        expectTypeOf<UseDraftForm<Draft>>().toExtend<typeof form>();
    });

    it('names D for a generic shallowRef, which TypeScript cannot read as a Ref<D>', () => {
        const host = <D extends object>(model: D): UseDraftForm<D> => useForm<D>({draft: shallowRef(model)});
        const unnamed = <D extends object>(model: D) => {
            const form = useForm({draft: shallowRef(model)});
            // a draft read as `any` checks no name, so its form cannot be used:
            // @ts-expect-error a member's value read
            void form.errors.value;
            const {handleSubmit} = form;
            // @ts-expect-error submitted through
            void handleSubmit(async () => {});
            // @ts-expect-error assigned to anything but a form
            const text: string = form;
            return text;
        };

        expectTypeOf(host({firstName: 'Ann'})).toEqualTypeOf<UseDraftForm<{firstName: string}>>();
        void unnamed;
    });
});
