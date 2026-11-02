// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick, ref} from 'vue';

import type {UseForm, UseFormOptions} from '../../src';

import {TextInput, useForm} from '../../src';

// The shape of an axios error that the form reads (see src/form/http-contract.ts); no axios import needed.
const requestError = (status: number, data: unknown = {}) => ({isAxiosError: true, response: {status, data}});

// An action that rejects with a 422 carrying these validation errors, as a refused request does.
const refusedWith = (errors: Record<string, unknown>) => () => Promise.reject(requestError(422, {errors}));

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return {promise, resolve};
};

// useForm takes its ids' unique part from Vue's useId(), so it runs in a component's setup().
const inSetup = <R>(use: () => R): R => {
    let result!: R;
    mount(
        defineComponent({
            setup() {
                result = use();
                return () => null;
            },
        }),
    );
    return result;
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useForm', () => {
    it('hands out the validation bag, take, clearErrors, handleSubmit and submitting from one call', () => {
        const form = inSetup(() => useForm());

        expect(form.errors.value).toEqual({});
        expect(form.refused.value).toBe(false);
        expect(form.unmapped.value).toEqual([]);
        expect(form.refusedUnnamed.value).toBe(false);
        expect(form.submitting.value).toBe(false);
        expect(form.take).toBeTypeOf('function');
        expect(form.clearErrors).toBeTypeOf('function');
        expect(form.handleSubmit).toBeTypeOf('function');
    });

    it("binds the 422 its own action rejects with and resolves 'refused'", async () => {
        const form = inSetup(() => useForm<'email'>());

        await expect(form.handleSubmit(refusedWith({email: ['Taken']}))).resolves.toBe('refused');

        expect(form.errors.value).toEqual({email: 'Taken'});
        expect(form.refused.value).toBe(true);
    });

    it('keeps a dotted path as the backend sent it when no keyMapper is given', async () => {
        const form = inSetup(() => useForm());

        await form.handleSubmit(refusedWith({'learningGoals.0.title': ['Required']}));

        expect(form.errors.value).toEqual({'learningGoals.0.title': 'Required'});
    });

    it('passes keyMapper through to the validation bag', async () => {
        const camel = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
        const form = inSetup(() => useForm({keyMapper: camel}));

        await form.handleSubmit(refusedWith({street_name: ['Required']}));

        expect(form.errors.value).toEqual({streetName: 'Required'});
    });

    it('passes the fields allow-list through to the validation bag', async () => {
        const form = inSetup(() => useForm({fields: ['email']}));

        await form.handleSubmit(refusedWith({email: ['Taken'], token: ['Expired']}));

        expect(form.errors.value).toEqual({email: 'Taken'});
        expect(form.unmapped.value).toEqual(['token']);
        expect(form.refusedUnnamed.value).toBe(false);
    });

    it('signals a refusal that names no field the form holds', async () => {
        const form = inSetup(() => useForm({fields: ['password']}));

        await expect(form.handleSubmit(refusedWith({token: ['Expired']}))).resolves.toBe('refused');

        expect(form.refused.value).toBe(true);
        expect(form.refusedUnnamed.value).toBe(true);
        expect(form.unmapped.value).toEqual(['token']);
    });

    it("toggles submitting around the action and clears the messages when it resolves ('sent')", async () => {
        const form = inSetup(() => useForm<'email'>());
        await form.handleSubmit(refusedWith({email: ['Taken']}));
        const gate = deferred();

        const inFlight = form.handleSubmit(() => gate.promise);
        expect(form.submitting.value).toBe(true);
        expect(form.errors.value).toEqual({email: 'Taken'});

        gate.resolve();
        await expect(inFlight).resolves.toBe('sent');
        expect(form.submitting.value).toBe(false);
        expect(form.errors.value).toEqual({});
        expect(form.refused.value).toBe(false);
    });

    it("keeps the messages when the action resolves false ('cancelled')", async () => {
        const form = inSetup(() => useForm<'email'>());
        await form.handleSubmit(refusedWith({email: ['Taken']}));

        await expect(form.handleSubmit(async () => false)).resolves.toBe('cancelled');

        expect(form.errors.value).toEqual({email: 'Taken'});
    });

    it("ignores a submit while one is in flight ('ignored')", async () => {
        const form = inSetup(() => useForm());
        const gate = deferred();
        const action = vi.fn(() => gate.promise);

        const first = form.handleSubmit(action);
        await expect(form.handleSubmit(action)).resolves.toBe('ignored');
        expect(action).toHaveBeenCalledOnce();

        gate.resolve();
        await expect(first).resolves.toBe('sent');
    });

    it('re-throws any other rejection and leaves the messages as they were', async () => {
        const form = inSetup(() => useForm<'email'>());
        await form.handleSubmit(refusedWith({email: ['Taken']}));
        const error = requestError(500);

        await expect(form.handleSubmit(() => Promise.reject(error))).rejects.toBe(error);

        expect(form.errors.value).toEqual({email: 'Taken'});
        expect(form.submitting.value).toBe(false);
    });

    it('holds nothing of a 422 its action catches itself', async () => {
        const form = inSetup(() => useForm());

        await form.handleSubmit(() => refusedWith({email: ['Taken']})().catch(() => undefined));

        expect(form.errors.value).toEqual({});
        expect(form.refused.value).toBe(false);
    });

    it('binds a 422 caught outside a submit through take', () => {
        const form = inSetup(() => useForm<'email'>());

        expect(form.take(requestError(422, {errors: {email: ['Taken']}}))).toBe(true);

        expect(form.errors.value).toEqual({email: 'Taken'});
    });

    it('keeps one form out of another form’s refusals', async () => {
        const page = inSetup(() => useForm<'email'>());
        const dialog = inSetup(() => useForm<'email'>());

        await dialog.handleSubmit(refusedWith({email: ['Taken']}));

        expect(dialog.errors.value).toEqual({email: 'Taken'});
        expect(page.errors.value).toEqual({});
        expect(page.refused.value).toBe(false);
    });

    it('clearErrors empties a filled bag', async () => {
        const form = inSetup(() => useForm<'email'>());
        await form.handleSubmit(refusedWith({email: ['Taken']}));

        form.clearErrors();

        expect(form.errors.value).toEqual({});
        expect(form.refused.value).toBe(false);
    });
});

describe('useForm with a draft', () => {
    interface Draft {
        firstName: string | null;
        learningGoals: {title: string | null}[];
    }

    it('binds a 422 keyed by the draft paths and leaves the draft as it was', async () => {
        const draft = ref<Draft>({firstName: 'Ann', learningGoals: [{title: 'Lezen'}]});
        const form = inSetup(() => useForm({draft, fields: ['firstName', 'learningGoals.0.title']}));

        await expect(
            form.handleSubmit(refusedWith({'learningGoals.0.title': ['Required'], token: ['Expired']})),
        ).resolves.toBe('refused');

        expect(form.errors.value).toEqual({'learningGoals.0.title': 'Required'});
        expect(form.unmapped.value).toEqual(['token']);
        expect(draft.value).toEqual({firstName: 'Ann', learningGoals: [{title: 'Lezen'}]});
    });
});

describe('useForm scroll-to-error', () => {
    let scrollIntoView: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    });

    // A form rendering `names` as controls wired by field(), in that order, attached to the document;
    // or, with `control` false, as the form's own FormError for each name.
    const mountFields = (names: string[], options: UseFormOptions = {}, control = true) => {
        let form!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm(options);
                    return () =>
                        h(
                            'div',
                            names.map((name) =>
                                control
                                    ? h(TextInput, {...form.field(name), placeholder: name, modelValue: ''})
                                    : h(form.FormError, {name}),
                            ),
                        );
                },
            }),
            {attachTo: document.body},
        );
        return {wrapper, form: () => form};
    };

    it("scrolls to the control of the first refused field, by the form's own id, when a submit is refused", async () => {
        const {wrapper, form} = mountFields(['email']);

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({behavior: 'smooth', block: 'center'});
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.find('input').element);
        wrapper.unmount();
    });

    it('passes over a field whose message is empty', async () => {
        const {wrapper, form} = mountFields(['first', 'second']);

        await form().handleSubmit(refusedWith({first: [''], second: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.findAll('input')[1]!.element);
        wrapper.unmount();
    });

    it('takes the first in document order, not the order the bag lists the fields in', async () => {
        const {wrapper, form} = mountFields(['first', 'second']);

        await form().handleSubmit(refusedWith({second: ['Required'], first: ['Required']}));

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.findAll('input')[0]!.element);
        wrapper.unmount();
    });

    it("falls back to the field's message element when no control carries the id", async () => {
        const {wrapper, form} = mountFields(['email'], {}, false);

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.find('p.ui-error').element);
        wrapper.unmount();
    });

    it('never scrolls to another form on the page that refused the same name', async () => {
        // one page is one app, so useId keeps the two forms' ids apart
        const forms: UseForm[] = [];
        const Block = defineComponent({
            setup() {
                const form = useForm();
                forms.push(form);
                return () => h(TextInput, {...form.field('email'), placeholder: 'email', modelValue: ''});
            },
        });
        const wrapper = mount(defineComponent({setup: () => () => h('div', [h(Block), h(Block)])}), {
            attachTo: document.body,
        });
        await forms[0]!.handleSubmit(refusedWith({email: ['Taken']}));
        scrollIntoView.mockClear();

        await forms[1]!.handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.findAll('input')[1]!.element);
        wrapper.unmount();
    });

    it('does nothing for a refusal it renders no element for, or an empty message', async () => {
        const {wrapper, form} = mountFields(['email']);

        await expect(form().handleSubmit(refusedWith({elsewhere: ['Not rendered'], email: ['']}))).resolves.toBe(
            'refused',
        );

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not scroll for a 422 taken outside a submit', async () => {
        const {wrapper, form} = mountFields(['email']);

        form().take(requestError(422, {errors: {email: ['Taken']}}));
        await nextTick();

        expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it("does not scroll when the next submit ends 'cancelled', though its messages still stand", async () => {
        const {wrapper, form} = mountFields(['email']);
        await form().handleSubmit(refusedWith({email: ['Taken']}));
        scrollIntoView.mockClear();

        await expect(form().handleSubmit(async () => false)).resolves.toBe('cancelled');

        expect(form().errors.value).toEqual({email: 'Taken'});
        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not scroll when scrollToError is false', async () => {
        const {wrapper, form} = mountFields(['email'], {scrollToError: false});

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('scrolls without animation under prefers-reduced-motion', async () => {
        vi.stubGlobal('matchMedia', (query: string) => ({matches: query === '(prefers-reduced-motion: reduce)'}));
        const {wrapper, form} = mountFields(['email']);

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({behavior: 'auto', block: 'center'});
        wrapper.unmount();
    });

    it('scrolls with smooth behavior when the runtime has no matchMedia', async () => {
        vi.stubGlobal('matchMedia', undefined);
        const {wrapper, form} = mountFields(['email']);

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({behavior: 'smooth', block: 'center'});
        wrapper.unmount();
    });
});

describe('useForm field()', () => {
    it('links a control to the form: an id from the name, and the mark and describedby while it has a message', () => {
        const form = inSetup(() => useForm<'email' | 'name' | 'learningGoals.0.title'>({idPrefix: 'f'}));

        expect(form.field('email')).toEqual({id: 'f-email', invalid: false, describedby: undefined});

        form.take(requestError(422, {errors: {email: ['Taken']}}));

        expect(form.field('email')).toEqual({id: 'f-email', invalid: true, describedby: 'f-email-error'});
        expect(form.field('name')).toEqual({id: 'f-name', invalid: false, describedby: undefined});
        expect(form.field('learningGoals.0.title').id).toBe('f-learningGoals-0-title');
    });

    it("puts the name first and appends each form's own part from useId, so same-named fields never share an id", () => {
        const ids: string[] = [];
        const Block = defineComponent({
            setup() {
                ids.push(useForm<'email'>().field('email').id);
                return () => null;
            },
        });
        // one page (one app), two blocks that both have an `email`
        mount(defineComponent({setup: () => () => h('div', [h(Block), h(Block)])}));

        expect(ids[0]).toMatch(/^email-v-\S+$/);
        expect(ids[1]).toMatch(/^email-v-\S+$/);
        expect(ids[0]).not.toBe(ids[1]);
    });

    it('lets idPrefix replace the generated prefix, for an id something outside the form must know', () => {
        const form = inSetup(() => useForm<'email'>({idPrefix: 'invoice'}));

        expect(form.field('email').id).toBe('invoice-email');
    });
});

describe('useForm FormLabel and FormError (form-bound)', () => {
    const mountRow = (options?: UseFormOptions) => {
        let form!: UseForm<'firstName'>;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm<'firstName'>(options);
                    return () =>
                        h('div', [
                            h(form.FormLabel, {name: 'firstName', label: 'Voornaam', required: true, class: 'w-40'}),
                            h(TextInput, {...form.field('firstName'), placeholder: 'Voornaam', modelValue: ''}),
                            h(form.FormError, {name: 'firstName'}),
                        ]);
                },
            }),
        );
        return {wrapper, form: () => form};
    };

    it("labels the control field() wires, and fills the message the control's describedby names", async () => {
        const {wrapper, form} = mountRow({idPrefix: 'client'});
        const label = wrapper.find('label');

        expect(label.attributes('for')).toBe('client-firstName');
        expect(label.text()).toContain('Voornaam');
        expect(label.find('.ui-label__req').exists()).toBe(true);
        expect(label.classes()).toContain('w-40');

        form().take(requestError(422, {errors: {firstName: ['Vul een voornaam in']}}));
        await nextTick();

        const message = wrapper.find(`#${wrapper.find('input').attributes('aria-describedby')}`);
        expect(message.text()).toBe('Vul een voornaam in');
        expect(message.attributes('role')).toBe('alert');
    });

    it("keeps the message's element in place, empty, while the field is clean", () => {
        const {wrapper} = mountRow({idPrefix: 'client'});
        const message = wrapper.find('p.ui-error');

        expect(message.exists()).toBe(true);
        expect(message.attributes('id')).toBe('client-firstName-error');
        expect(message.text()).toBe('');
    });
});
