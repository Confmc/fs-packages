// @vitest-environment happy-dom
import type {AxiosError} from 'axios';

import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick} from 'vue';

import type {UseForm, UseFormOptions} from '../../src';

import {TextInput, useForm} from '../../src';

// A caught request error the way axios (fs-http's transport) shapes it.
const refusal = (status: number, data: unknown) => ({isAxiosError: true, response: {status, data}});

const mountForm = <T extends string = string>(options: UseFormOptions = {}) => {
    let result!: UseForm<T>;
    const wrapper = mount(
        defineComponent({
            setup() {
                result = useForm<T>(options);
                return () => null;
            },
        }),
    );
    return {wrapper, result: () => result};
};

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return {promise, resolve};
};

const makeAxiosError = (status: number): AxiosError => ({isAxiosError: true, response: {status}}) as AxiosError;

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useForm', () => {
    it('exposes the validation bag, clearErrors, handleSubmit and submitting from one call', () => {
        const {result} = mountForm();

        expect(result().errors.value).toEqual({});
        expect(result().submitting.value).toBe(false);
        expect(typeof result().clearErrors).toBe('function');
        expect(typeof result().handleSubmit).toBe('function');
    });

    it('binds a 422 it is handed into the error bag', () => {
        const {result} = mountForm<'email'>();

        result().take(refusal(422, {errors: {email: ['Taken']}}));

        expect(result().errors.value).toEqual({email: 'Taken'});
    });

    it('passes keyMapper through to the internal validation layer', () => {
        const camel = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
        const {result} = mountForm({keyMapper: camel});

        result().take(refusal(422, {errors: {street_name: ['Required']}}));

        expect(result().errors.value).toEqual({streetName: 'Required'});
    });

    it('toggles submitting around handleSubmit and swallows a 422', async () => {
        const {result} = mountForm();
        const gate = deferred();

        const inFlight = result().handleSubmit(() => gate.promise);
        expect(result().submitting.value).toBe(true);

        gate.resolve();
        await inFlight;
        expect(result().submitting.value).toBe(false);

        await expect(
            result().handleSubmit(async () => {
                throw makeAxiosError(422);
            }),
        ).resolves.toBe('refused');
    });

    it('re-throws a non-422 rejection through handleSubmit', async () => {
        const {result} = mountForm();
        const error = makeAxiosError(500);

        await expect(
            result().handleSubmit(async () => {
                throw error;
            }),
        ).rejects.toBe(error);
    });

    it('clearErrors empties a populated bag', () => {
        const {result} = mountForm<'email'>();

        result().take(refusal(422, {errors: {email: ['Taken']}}));
        expect(result().errors.value).toEqual({email: 'Taken'});

        result().clearErrors();
        expect(result().errors.value).toEqual({});
    });
});

describe('useForm scroll-to-error', () => {
    let scrollIntoView: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    });

    // A form rendering `names` as controls wired by field(), in that order, attached to the document.
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
                                control ? h(TextInput, {...form.field(name), modelValue: ''}) : h(form.Message, {name}),
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

        await form().handleSubmit(() => Promise.reject(refusal(422, {errors: {email: ['Taken']}})));

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center'});
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.find('input').element);
        wrapper.unmount();
    });

    it('takes the first in document order, not the order the bag lists the fields in', async () => {
        const {wrapper, form} = mountFields(['first', 'second']);

        await form().handleSubmit(async () => {}, {validate: () => ({second: 'Required', first: 'Required'})});

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.findAll('input')[0]!.element);
        wrapper.unmount();
    });

    it("falls back to the field's message element when no control carries the id", async () => {
        const {wrapper, form} = mountFields(['email'], {}, false);

        await form().handleSubmit(() => Promise.reject(refusal(422, {errors: {email: ['Taken']}})));

        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.find('p.ui-error').element);
        wrapper.unmount();
    });

    it('never scrolls to another form on the page that refused the same name', async () => {
        // one page is one app, so useId keeps the two forms' prefixes apart
        const forms: UseForm[] = [];
        const Block = defineComponent({
            setup() {
                const form = useForm();
                forms.push(form);
                return () => h(TextInput, {...form.field('email'), modelValue: ''});
            },
        });
        const wrapper = mount(defineComponent({setup: () => () => h('div', [h(Block), h(Block)])}), {
            attachTo: document.body,
        });

        await forms[1]!.handleSubmit(() => Promise.reject(refusal(422, {errors: {email: ['Taken']}})));

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.findAll('input')[1]!.element);
        wrapper.unmount();
    });

    it('does nothing for a refusal it renders no element for, or an empty message', async () => {
        const {wrapper, form} = mountFields(['email']);

        await form().handleSubmit(async () => {}, {validate: () => ({elsewhere: 'Not rendered', email: ''})});

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('never scrolls on refuse or setRefusals alone, so typing never jumps the page', async () => {
        const {wrapper, form} = mountFields(['email']);

        form().refuse('email', 'Taken');
        form().setRefusals({email: 'Required'});
        await nextTick();

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not scroll when scrollToError is false', async () => {
        const {wrapper, form} = mountFields(['email'], {scrollToError: false});

        await form().handleSubmit(() => Promise.reject(refusal(422, {errors: {email: ['Taken']}})));

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('scrolls without animation under prefers-reduced-motion', async () => {
        vi.stubGlobal('matchMedia', (query: string) => ({matches: query === '(prefers-reduced-motion: reduce)'}));
        const {wrapper, form} = mountFields(['email']);

        await form().handleSubmit(() => Promise.reject(refusal(422, {errors: {email: ['Taken']}})));

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'auto', block: 'center'});
        wrapper.unmount();
    });

    it('scrolls with smooth behavior when the runtime has no matchMedia', async () => {
        vi.stubGlobal('matchMedia', undefined);
        const {wrapper, form} = mountFields(['email']);

        await form().handleSubmit(() => Promise.reject(refusal(422, {errors: {email: ['Taken']}})));

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center'});
        wrapper.unmount();
    });
});

describe("useForm takes its own request's 422", () => {
    it('passes the fields allow-list through to the validation layer', () => {
        const {result} = mountForm({fields: ['email']});

        result().take(refusal(422, {errors: {email: ['Taken'], token: ['Expired']}}));

        expect(result().errors.value).toEqual({email: 'Taken'});
        expect(result().unmapped.value).toEqual(['token']);
    });

    it('binds the 422 its own submit rejected with', async () => {
        const {result} = mountForm();

        await expect(
            result().handleSubmit(() => Promise.reject(refusal(422, {errors: {email: ['Taken']}}))),
        ).resolves.toBe('refused');

        expect(result().errors.value).toEqual({email: 'Taken'});
        expect(result().refused.value).toBe(true);
    });

    // Supersedes DECISIONS D1: identity is the submit's own rejection, so no time window is left.
    it("never sees another request's 422, not even one that lands while its own submit is in flight", async () => {
        const page = mountForm();
        const dialog = mountForm();
        const gate = deferred();

        const pageSubmit = page.result().handleSubmit(() => gate.promise);
        await dialog.result().handleSubmit(() => Promise.reject(refusal(422, {errors: {email: ['Taken']}})));

        expect(page.result().errors.value).toEqual({});
        expect(page.result().refused.value).toBe(false);

        gate.resolve();
        await expect(pageSubmit).resolves.toBe('sent');
    });

    it('takes a 422 caught outside a submit through take, and hands anything else back', () => {
        const {result} = mountForm();
        const lookup = (error: unknown) => {
            if (!result().take(error)) throw error;
        };

        lookup(refusal(422, {errors: {zipcode: ['Onbekende postcode']}}));
        expect(result().errors.value).toEqual({zipcode: 'Onbekende postcode'});
        expect(() => lookup(refusal(500, {}))).toThrow();
    });

    it('misses a 422 its action catches itself: the action must let it reject, or take it', async () => {
        const {result} = mountForm();

        const outcome = await result().handleSubmit(async () => {
            await Promise.reject(refusal(422, {errors: {email: ['Taken']}})).catch(() => undefined);
        });

        expect(outcome).toBe('sent');
        expect(result().refused.value).toBe(false);
    });

    it('drops the previous refusal when a new submit starts', async () => {
        const {result} = mountForm();

        await result().handleSubmit(() => Promise.reject(refusal(422, {errors: {email: ['Taken']}})));
        await result().handleSubmit(async () => {});

        expect(result().errors.value).toEqual({});
        expect(result().refused.value).toBe(false);
    });
});

describe('useForm handleSubmit validate', () => {
    it('refuses without running the action when validate names a field', async () => {
        const {result} = mountForm<'email'>();
        const action = vi.fn(async () => {});

        await expect(result().handleSubmit(action, {validate: () => ({email: 'Required'})})).resolves.toBe('refused');

        expect(action).not.toHaveBeenCalled();
        expect(result().clientErrors.value).toEqual({email: 'Required'});
        expect(result().fieldErrors.value).toEqual({email: 'Required'});
    });

    it('clears the client refusals and runs the action when validate finds nothing', async () => {
        const {result} = mountForm<'email'>();
        result().refuse('email', 'Required');
        const action = vi.fn(async () => {});

        await expect(result().handleSubmit(action, {validate: () => ({email: ''})})).resolves.toBe('sent');

        expect(action).toHaveBeenCalledOnce();
        expect(result().clientErrors.value).toEqual({});
    });

    it('ignores a call while a submit is in flight, before validating', async () => {
        const {result} = mountForm<'email'>();
        const gate = deferred();
        const validate = vi.fn(() => ({}));

        const first = result().handleSubmit(() => gate.promise);
        await expect(result().handleSubmit(async () => {}, {validate})).resolves.toBe('ignored');
        expect(validate).not.toHaveBeenCalled();

        gate.resolve();
        await first;
    });
});

describe('useForm field()', () => {
    it('links a control to the form: an id from the name, and the message with its mark and describedby', () => {
        const {result} = mountForm<'email' | 'name' | 'learningGoals.0.title'>({
            idPrefix: 'f',
            onlyWhileSubmitting: false,
        });

        expect(result().field('email')).toEqual({
            id: 'f-email',
            invalid: false,
            describedby: undefined,
            error: undefined,
        });

        result().take(refusal(422, {errors: {email: ['Taken'], name: ['Required']}}));
        result().refuse('name', 'Too short');

        expect(result().field('email')).toEqual({
            id: 'f-email',
            invalid: true,
            describedby: 'f-email-error',
            error: 'Taken',
        });
        expect(result().field('name').error).toBe('Too short');
        expect(result().field('learningGoals.0.title').id).toBe('f-learningGoals-0-title');
    });

    it("gives every form its own prefix from useId, so two forms' same-named fields never share an id", () => {
        const ids: string[] = [];
        const Block = defineComponent({
            setup() {
                ids.push(useForm<'email'>().field('email').id);
                return () => null;
            },
        });
        // one page (one app), two blocks that both have an `email`
        mount(defineComponent({setup: () => () => h('div', [h(Block), h(Block)])}));

        expect(ids[0]).toMatch(/^v-\S+-email$/);
        expect(ids[1]).toMatch(/^v-\S+-email$/);
        expect(ids[0]).not.toBe(ids[1]);
    });

    it('lets idPrefix replace the generated prefix, for an id something outside the form must know', () => {
        const {result} = mountForm<'email'>({idPrefix: 'invoice'});

        expect(result().field('email').id).toBe('invoice-email');
    });
});

describe('useForm FieldLabel and Message', () => {
    const mountRow = (options?: UseFormOptions) => {
        let form!: UseForm<'firstName'>;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm<'firstName'>(options);
                    return () =>
                        h('div', [
                            h(form.FieldLabel, {name: 'firstName', label: 'Voornaam', required: true, class: 'w-40'}),
                            h(TextInput, {...form.field('firstName'), modelValue: ''}),
                            h(form.Message, {name: 'firstName'}),
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

        form().take(refusal(422, {errors: {firstName: ['Vul een voornaam in']}}));
        await nextTick();

        const message = wrapper.find(`#${wrapper.find('input').attributes('aria-describedby')}`);
        expect(message.text()).toBe('Vul een voornaam in');
        expect(message.attributes('role')).toBe('alert');
    });

    it('renders its slot after the label text and the required mark, inside the label', () => {
        const wrapper = mount(
            defineComponent({
                setup() {
                    const {FieldLabel} = useForm<'actions'>();
                    return () =>
                        h(FieldLabel, {name: 'actions', label: 'Acties', required: true}, () =>
                            h('span', {class: 'note'}, 'optioneel'),
                        );
                },
            }),
        );
        const label = wrapper.find('label');

        expect(label.text()).toBe('Acties*optioneel');
        expect(label.find('.ui-label__req + .note').exists()).toBe(true);
    });

    it("keeps the message's element in place, empty, while the field is clean", () => {
        const {wrapper} = mountRow({idPrefix: 'client'});
        const message = wrapper.find('p.ui-error');

        expect(message.exists()).toBe(true);
        expect(message.attributes('id')).toBe('client-firstName-error');
        expect(message.text()).toBe('');
    });
});
