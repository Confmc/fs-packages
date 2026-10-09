// @vitest-environment happy-dom
import type {AxiosResponseError, HttpService, ResponseErrorMiddlewareFunc} from '@script-development/fs-http';
import type {AxiosError} from 'axios';

import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick} from 'vue';

import type {UseForm, UseFormOptions} from '../../src';

import {TextInput, useForm} from '../../src';

const createMockHttpService = () => {
    const errorMiddlewares: ResponseErrorMiddlewareFunc[] = [];

    const triggerError = (status: number, data: unknown): void => {
        const error = {isAxiosError: true, response: {status, data}} as AxiosError<AxiosResponseError>;
        for (const middleware of errorMiddlewares) middleware(error);
    };

    const httpService = {
        getRequest: vi.fn(),
        postRequest: vi.fn(),
        putRequest: vi.fn(),
        patchRequest: vi.fn(),
        deleteRequest: vi.fn(),
        downloadRequest: vi.fn(),
        previewRequest: vi.fn(),
        registerRequestMiddleware: vi.fn(() => () => {}),
        registerResponseMiddleware: vi.fn(() => () => {}),
        registerResponseErrorMiddleware: vi.fn((fn: ResponseErrorMiddlewareFunc) => {
            errorMiddlewares.push(fn);
            return () => {
                const index = errorMiddlewares.indexOf(fn);
                if (index > -1) errorMiddlewares.splice(index, 1);
            };
        }),
    } as unknown as HttpService;

    return {httpService, triggerError, errorMiddlewares};
};

// Most cases here raise a 422 by hand, outside any submit, so the helper takes idle ones; the cases
// about the submit window say so explicitly.
const mountForm = <T extends string = string>(
    httpService: HttpService,
    options: UseFormOptions = {onlyWhileSubmitting: false},
) => {
    let result!: UseForm<T>;
    const wrapper = mount(
        defineComponent({
            setup() {
                result = useForm<T>(httpService, options);
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
        const {httpService} = createMockHttpService();
        const {result} = mountForm(httpService);

        expect(result().errors.value).toEqual({});
        expect(result().submitting.value).toBe(false);
        expect(typeof result().clearErrors).toBe('function');
        expect(typeof result().handleSubmit).toBe('function');
    });

    it('binds a 422 into the error bag via the internal middleware', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm<'email'>(httpService);

        triggerError(422, {errors: {email: ['Taken']}});

        expect(result().errors.value).toEqual({email: 'Taken'});
    });

    it('passes keyMapper through to the internal validation layer', () => {
        const {httpService, triggerError} = createMockHttpService();
        const camel = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
        const {result} = mountForm(httpService, {keyMapper: camel, onlyWhileSubmitting: false});

        triggerError(422, {errors: {street_name: ['Required']}});

        expect(result().errors.value).toEqual({streetName: 'Required'});
    });

    it('toggles submitting around handleSubmit and swallows a 422', async () => {
        const {httpService} = createMockHttpService();
        const {result} = mountForm(httpService);
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
        const {httpService} = createMockHttpService();
        const {result} = mountForm(httpService);
        const error = makeAxiosError(500);

        await expect(
            result().handleSubmit(async () => {
                throw error;
            }),
        ).rejects.toBe(error);
    });

    it('clearErrors empties a populated bag', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm<'email'>(httpService);

        triggerError(422, {errors: {email: ['Taken']}});
        expect(result().errors.value).toEqual({email: 'Taken'});

        result().clearErrors();
        expect(result().errors.value).toEqual({});
    });

    it('unregisters the internal middleware on unmount', () => {
        const {httpService, errorMiddlewares} = createMockHttpService();
        const {wrapper} = mountForm(httpService);

        expect(errorMiddlewares).toHaveLength(1);

        wrapper.unmount();

        expect(errorMiddlewares).toHaveLength(0);
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
                    form = useForm(createMockHttpService().httpService, options);
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

    it("scrolls to the control of the first refused field, by the form's own id, by default", async () => {
        const {wrapper, form} = mountFields(['email']);

        form().refuse('email', 'Taken');
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center'});
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.find('input').element);
        wrapper.unmount();
    });

    it('takes the first in document order, not the order the bag lists the fields in', async () => {
        const {wrapper, form} = mountFields(['first', 'second']);

        form().setRefusals({second: 'Required', first: 'Required'});
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.findAll('input')[0]!.element);
        wrapper.unmount();
    });

    it("falls back to the field's message element when no control carries the id", async () => {
        const {wrapper, form} = mountFields(['email'], {}, false);

        form().refuse('email', 'Taken');
        await nextTick();

        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.find('p.ui-error').element);
        wrapper.unmount();
    });

    it('never scrolls to another form on the page that refused the same name', async () => {
        // one page is one app, so useId keeps the two forms' prefixes apart
        const forms: UseForm[] = [];
        const Block = defineComponent({
            setup() {
                const form = useForm(createMockHttpService().httpService);
                forms.push(form);
                return () => h(TextInput, {...form.field('email'), modelValue: ''});
            },
        });
        const wrapper = mount(defineComponent({setup: () => () => h('div', [h(Block), h(Block)])}), {
            attachTo: document.body,
        });

        forms[1]!.refuse('email', 'Taken');
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(wrapper.findAll('input')[1]!.element);
        wrapper.unmount();
    });

    it('does nothing for a refusal it renders no element for, an empty message, or when cleared', async () => {
        const {wrapper, form} = mountFields(['email']);

        form().setRefusals({elsewhere: 'Not rendered', email: ''});
        await nextTick();
        form().clearClient();
        await nextTick();

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not scroll when scrollToError is false', async () => {
        const {wrapper, form} = mountFields(['email'], {scrollToError: false});

        form().refuse('email', 'Taken');
        await nextTick();

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('scrolls without animation under prefers-reduced-motion', async () => {
        vi.stubGlobal('matchMedia', (query: string) => ({matches: query === '(prefers-reduced-motion: reduce)'}));
        const {wrapper, form} = mountFields(['email']);

        form().refuse('email', 'Taken');
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'auto', block: 'center'});
        wrapper.unmount();
    });

    it('scrolls with smooth behavior when the runtime has no matchMedia', async () => {
        vi.stubGlobal('matchMedia', undefined);
        const {wrapper, form} = mountFields(['email']);

        form().refuse('email', 'Taken');
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center'});
        wrapper.unmount();
    });
});

describe('useForm submit window and refusal signal', () => {
    // A request double that behaves like fs-http: the response-error middleware runs
    // synchronously inside the interceptor, then the promise rejects.
    const refusingRequest = (triggerError: (status: number, data: unknown) => void, data: unknown) => () => {
        triggerError(422, data);
        return Promise.reject(makeAxiosError(422));
    };

    it('passes the fields allow-list through to the validation layer', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService, {fields: ['email'], onlyWhileSubmitting: false});

        triggerError(422, {errors: {email: ['Taken'], token: ['Expired']}});

        expect(result().errors.value).toEqual({email: 'Taken'});
        expect(result().unmapped.value).toEqual(['token']);
    });

    it('by default leaves the bag untouched for a 422 that arrives while the form is idle', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService, {});

        triggerError(422, {errors: {email: ['Taken']}});

        expect(result().errors.value).toEqual({});
        expect(result().refused.value).toBe(false);
    });

    it('binds a 422 that arrives while the form is idle when onlyWhileSubmitting is off', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService, {onlyWhileSubmitting: false});

        triggerError(422, {errors: {email: ['Taken']}});

        expect(result().errors.value).toEqual({email: 'Taken'});
        expect(result().refused.value).toBe(true);
    });

    it('leaves the bag untouched for a 422 that arrives while the form is idle under onlyWhileSubmitting', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService, {onlyWhileSubmitting: true});

        triggerError(422, {errors: {email: ['Taken']}});

        expect(result().errors.value).toEqual({});
        expect(result().refused.value).toBe(false);
    });

    it('binds a 422 raised inside its own handleSubmit under onlyWhileSubmitting', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService, {onlyWhileSubmitting: true});

        await result().handleSubmit(refusingRequest(triggerError, {errors: {email: ['Taken']}}));

        expect(result().errors.value).toEqual({email: 'Taken'});
        expect(result().refused.value).toBe(true);
    });

    it('ignores a late 422 after its own submit settled under onlyWhileSubmitting', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService, {onlyWhileSubmitting: true});

        await result().handleSubmit(async () => {});
        triggerError(422, {errors: {email: ['Taken']}});

        expect(result().errors.value).toEqual({});
        expect(result().refused.value).toBe(false);
    });

    // Regression pin for DECISIONS D1 (WR-1992): the gate is a time window. Real request
    // identity would turn this red on purpose — read D1 before changing it.
    it('accepts a foreign 422 that lands while its submit is in flight under onlyWhileSubmitting', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService, {onlyWhileSubmitting: true});
        const gate = deferred();

        const inFlight = result().handleSubmit(() => gate.promise);
        triggerError(422, {errors: {email: ['Taken in another form']}});

        expect(result().errors.value).toEqual({email: 'Taken in another form'});
        expect(result().refused.value).toBe(true);

        gate.resolve();
        await inFlight;
    });

    it('signals a refusal to a consumer whose action catches and classifies the 422 itself', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService, {fields: ['password'], onlyWhileSubmitting: true});
        const request = refusingRequest(triggerError, {errors: {token: ['Expired']}});
        let outcome = 'unsent';

        await result().handleSubmit(async () => {
            outcome = await request().then(
                () => 'saved',
                () => 'refused',
            );
        });

        expect(outcome).toBe('refused');
        expect(result().refused.value).toBe(true);
        expect(result().refusedUnnamed.value).toBe(true);
        expect(result().unmapped.value).toEqual(['token']);
    });

    it('drops the previous refusal when a new submit starts', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService, {onlyWhileSubmitting: true});

        await result().handleSubmit(refusingRequest(triggerError, {errors: {email: ['Taken']}}));
        await result().handleSubmit(async () => {});

        expect(result().errors.value).toEqual({});
        expect(result().refused.value).toBe(false);
    });
});

describe('useForm field()', () => {
    it('links a control to the form: an id from the name, and the message with its mark and describedby', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm<'email' | 'name' | 'learningGoals.0.title'>(httpService, {
            idPrefix: 'f',
            onlyWhileSubmitting: false,
        });

        expect(result().field('email')).toEqual({
            id: 'f-email',
            invalid: false,
            describedby: undefined,
            error: undefined,
        });

        triggerError(422, {errors: {email: ['Taken'], name: ['Required']}});
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
        const {httpService} = createMockHttpService();
        const ids: string[] = [];
        const Block = defineComponent({
            setup() {
                ids.push(useForm<'email'>(httpService).field('email').id);
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
        const {httpService} = createMockHttpService();
        const {result} = mountForm<'email'>(httpService, {idPrefix: 'invoice'});

        expect(result().field('email').id).toBe('invoice-email');
    });
});

describe('useForm FieldLabel and Message', () => {
    const mountRow = (options?: UseFormOptions) => {
        const {httpService, triggerError} = createMockHttpService();
        let form!: UseForm<'firstName'>;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm<'firstName'>(httpService, {onlyWhileSubmitting: false, ...options});
                    return () =>
                        h('div', [
                            h(form.FieldLabel, {name: 'firstName', label: 'Voornaam', required: true, class: 'w-40'}),
                            h(TextInput, {...form.field('firstName'), modelValue: ''}),
                            h(form.Message, {name: 'firstName'}),
                        ]);
                },
            }),
        );
        return {wrapper, triggerError, form: () => form};
    };

    it("labels the control field() wires, and fills the message the control's describedby names", async () => {
        const {wrapper, triggerError} = mountRow({idPrefix: 'client'});
        const label = wrapper.find('label');

        expect(label.attributes('for')).toBe('client-firstName');
        expect(label.text()).toContain('Voornaam');
        expect(label.find('.ui-label__req').exists()).toBe(true);
        expect(label.classes()).toContain('w-40');

        triggerError(422, {errors: {firstName: ['Vul een voornaam in']}});
        await nextTick();

        const message = wrapper.find(`#${wrapper.find('input').attributes('aria-describedby')}`);
        expect(message.text()).toBe('Vul een voornaam in');
        expect(message.attributes('role')).toBe('alert');
    });

    it('renders its slot after the label text and the required mark, inside the label', () => {
        const {httpService} = createMockHttpService();
        const wrapper = mount(
            defineComponent({
                setup() {
                    const {FieldLabel} = useForm<'actions'>(httpService);
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
