// Type test (see DraftTyping.vue): a helper generic over its draft, as a dialog host that builds the form for
// any modal. Each line that names a type is an assertion; typecheck fails when it stops holding.
import type {Ref} from 'vue';

import {shallowRef} from 'vue';

import type {Path, PathValue, UseDraftForm} from '../../src';

import {useForm} from '../../src/form/form';

export const hostForm = <D extends object>(draft: Ref<D>) => {
    // the draft overload, without spelling out D
    const form: UseDraftForm<D> = useForm({draft});

    // what a child that receives the form uses: the bound controls are part of UseDraftForm
    void form.TextField;
    void form.FormField;
    void form.handleSubmit;

    return form;
};

export const hostField = <D extends object>(draft: Ref<D>, path: Path<D>) => {
    // un-annotated: only the draft overload's field() carries the value at the path
    const raw = useForm({draft});
    const value: PathValue<D, Path<D>> = raw.field(path).modelValue;

    return value;
};

export const hostShallow = <D extends object>(model: D, path: Path<D>) => {
    // the opener owns the draft; a dialog host wraps it for the modal it renders
    // shallowRef's own conditional type hides Ref<D> while D is generic, so the host names D
    const raw = useForm<D>({draft: shallowRef(model)});
    const value: PathValue<D, Path<D>> = raw.field(path).modelValue;

    return value;
};
