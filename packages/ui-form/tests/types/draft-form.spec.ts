// @vitest-environment happy-dom
// useForm loads the form-bound FormLabel's SFC: under node it is compiled for SSR, a second copy the
// coverage report cannot merge with the one the component specs render.
// Type test (see path.spec.ts): useForm with a draft names its fields by the draft's paths.
import type {Ref} from 'vue';

import {describe, expectTypeOf, it} from 'vitest';
import {ref, shallowRef} from 'vue';

import type {FieldBinding, FieldModel, Path, UseDraftForm, UseForm, ValidationErrors} from '../../src';

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

describe('the client refusals on a form with a draft', () => {
    it('take only the draft paths, nested, indexed and through a nullable branch', () => {
        const {refuse, setRefusals, withdraw, handleSubmit} = useForm({draft});

        refuse('parent.learningGoals.3.title', 'Required');
        setRefusals({firstName: 'Required', 'learningGoals.0.title': ''});
        withdraw('learningGoals', 'firstName');
        void handleSubmit(async () => {}, {validate: () => ({born: 'Required'})});
        // @ts-expect-error a validator declared on the draft paths names only those
        const validate = (): ValidationErrors<Path<Draft>> => ({firstName: 'Required', frstName: 'Required'});
        // @ts-expect-error not a path of the draft
        refuse('frstName', 'Required');
        // @ts-expect-error a leaf's own members are not paths
        refuse('born.getTime', 'Required');
        // @ts-expect-error not a path of the draft
        setRefusals({frstName: 'Required'});
        // @ts-expect-error not a path of the draft
        withdraw('firstName', 'frstName');
        // validate's bag is named by the draft paths, a misspelled name next to a right one included
        // (TypeScript checks no extra key on a literal a callback returns; the signature does).
        // @ts-expect-error not a path of the draft, next to one that is
        void handleSubmit(async () => {}, {validate: () => ({firstName: 'Required', frstName: 'Required'})});
        void handleSubmit(async () => {}, {validate: () => (Math.random() > 0.5 ? {firstName: 'Required'} : {})});
        void handleSubmit(async () => {}, {validate});
    });

    it('key clientErrors and fieldErrors by the draft paths', () => {
        const {clientErrors, fieldErrors} = useForm({draft});

        expectTypeOf(clientErrors.value['learningGoals.0.title']).toEqualTypeOf<string | undefined>();
        expectTypeOf(fieldErrors.value['parent.firstName']).toEqualTypeOf<string | undefined>();
        // @ts-expect-error not a path of the draft
        void fieldErrors.value.frstName;
    });
});

describe('field() on a form with a draft', () => {
    it('takes only the draft paths, nested, indexed and through a nullable branch', () => {
        const {field} = useForm({draft});

        field('firstName');
        field('learningGoals.0.title');
        field('parent.learningGoals.3.title');
        // @ts-expect-error not a path of the draft
        field('frstName');
        // @ts-expect-error a leaf's own members are not paths
        field('born.getTime');
    });

    it('carries the value at the path and takes that type back', () => {
        const {field} = useForm({draft});

        expectTypeOf(field('firstName').modelValue).toEqualTypeOf<string | null>();
        expectTypeOf(field('born').modelValue).toEqualTypeOf<Date>();
        expectTypeOf(field('learningGoals').modelValue).toEqualTypeOf<{title: string | null}[]>();
        expectTypeOf(field('parent').modelValue).toEqualTypeOf<Draft | null>();
        expectTypeOf(field('parent.learningGoals.3.title').modelValue).toEqualTypeOf<string | null>();
        expectTypeOf(field('born')['onUpdate:modelValue']).toEqualTypeOf<(value: Date) => void>();
        expectTypeOf(field('firstName')).toEqualTypeOf<FieldBinding & FieldModel<string | null>>();
        // @ts-expect-error the write-back takes the path's value type
        field('born')['onUpdate:modelValue']('2026-01-01');
    });
});

describe('useForm without a draft', () => {
    it('names its fields by free strings, or by the union it is given', () => {
        expectTypeOf(useForm()).toEqualTypeOf<UseForm<string>>();
        expectTypeOf(useForm({fields: ['email', 'password']})).toEqualTypeOf<UseForm<'email' | 'password'>>();
        expectTypeOf(useForm<'email'>().errors.value).toEqualTypeOf<Partial<Record<'email', string>>>();
    });

    it("takes only the form's names in the client refusals", () => {
        const form = useForm<'email' | 'name'>();

        form.refuse('email', 'Taken');
        form.setRefusals({name: 'Required'});
        form.withdraw('email', 'name');
        void form.handleSubmit(async () => {}, {validate: () => ({email: 'Required'})});
        expectTypeOf(form.fieldErrors.value).toEqualTypeOf<Partial<Record<'email' | 'name', string>>>();
        // @ts-expect-error not one of the form's names
        form.refuse('password', 'Required');
        // @ts-expect-error not one of the form's names
        form.setRefusals({password: 'Required'});
        // @ts-expect-error not one of the form's names
        form.withdraw('password');
        void form.handleSubmit(async () => {}, {validate: () => ({email: 'Required'})});
        // @ts-expect-error not one of the form's names, next to one that is
        void form.handleSubmit(async () => {}, {validate: () => ({email: 'Required', emial: 'Required'})});
        // free strings without a union
        useForm().refuse('anything', 'Required');
    });

    it('wires a field by its name, with no value', () => {
        expectTypeOf(useForm().field('anything')).toEqualTypeOf<FieldBinding>();
        // @ts-expect-error not one of the form's names
        useForm<'email'>().field('name');
        // @ts-expect-error no draft, no modelValue
        void useForm().field('anything').modelValue;
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
