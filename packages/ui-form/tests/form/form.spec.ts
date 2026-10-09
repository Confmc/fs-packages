// @vitest-environment happy-dom
import type {AxiosResponseError, HttpService, ResponseErrorMiddlewareFunc} from '@script-development/fs-http';
import type {AxiosError} from 'axios';

import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick, ref} from 'vue';

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

const mountForm = <T extends string = string>(httpService: HttpService, options?: UseFormOptions) => {
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

// Mounts (attached to the document) a form that renders one field marked `aria-invalid`
// while the error bag is non-empty — the shape the scroll watcher queries for.
const mountFieldForm = (httpService: HttpService, options?: UseFormOptions, markInvalid = true) => {
    let result!: UseForm;
    const wrapper = mount(
        defineComponent({
            setup() {
                // The scroll is opt-in; these cases are about what it does once asked for.
                result = useForm(httpService, {scrollToError: true, ...options});
                return () =>
                    h('input', {
                        'aria-invalid': markInvalid && Object.keys(result.errors.value).length > 0 ? 'true' : 'false',
                    });
            },
        }),
        {attachTo: document.body},
    );
    return {wrapper, result: () => result};
};

// Mounts (attached) a form whose invalid field sits inside (or outside) a `scrollRoot` element,
// to prove the query is scoped to that root's subtree.
const mountScopedForm = (httpService: HttpService, fieldInsideRoot: boolean) => {
    const scrollRoot = ref<HTMLElement | null>(null);
    let result!: UseForm;
    const wrapper = mount(
        defineComponent({
            setup() {
                result = useForm(httpService, {scrollToError: true, scrollRoot});
                const marked = () => (Object.keys(result.errors.value).length > 0 ? 'true' : 'false');
                return () =>
                    h('div', [
                        h('div', {ref: scrollRoot}, [fieldInsideRoot ? h('input', {'aria-invalid': marked()}) : null]),
                        fieldInsideRoot ? null : h('input', {'aria-invalid': marked()}),
                    ]);
            },
        }),
        {attachTo: document.body},
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
        const {result} = mountForm(httpService, {keyMapper: camel});

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

    it('scrolls the first invalid field into view after a 422', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {wrapper} = mountFieldForm(httpService);

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center'});
        wrapper.unmount();
    });

    it('scrolls to the first invalid field in document order when several are marked', async () => {
        const {httpService, triggerError} = createMockHttpService();
        let result!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    result = useForm(httpService, {scrollToError: true});
                    const marked = () => (Object.keys(result.errors.value).length > 0 ? 'true' : 'false');
                    return () =>
                        h('div', [h('input', {'aria-invalid': marked()}), h('input', {'aria-invalid': marked()})]);
                },
            }),
            {attachTo: document.body},
        );

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        const invalid = document.querySelectorAll('[aria-invalid="true"]');
        expect(invalid).toHaveLength(2);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.contexts[0]).toBe(invalid[0]);
        wrapper.unmount();
    });

    it('does not scroll unless the caller asks for it', async () => {
        const {httpService, triggerError} = createMockHttpService();
        // No `scrollToError`, so the default decides.
        const {wrapper} = mountFieldForm(httpService, {scrollToError: undefined});

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not scroll when scrollToError is false', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {wrapper} = mountFieldForm(httpService, {scrollToError: false});

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not scroll again once the error bag is cleared', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {wrapper, result} = mountFieldForm(httpService);

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();
        expect(scrollIntoView).toHaveBeenCalledTimes(1);

        result().clearErrors();
        await nextTick();
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    it('does not scroll to an independently invalid field when the bag is cleared', async () => {
        const {httpService, triggerError} = createMockHttpService();
        let result!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    result = useForm(httpService, {scrollToError: true});
                    // This form's own field is marked only while its bag holds errors; the sibling
                    // stays invalid on its own, unrelated to this form's bag.
                    const marked = () => (Object.keys(result.errors.value).length > 0 ? 'true' : 'false');
                    return () =>
                        h('div', [h('input', {'aria-invalid': marked()}), h('input', {'aria-invalid': 'true'})]);
                },
            }),
            {attachTo: document.body},
        );

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();
        expect(scrollIntoView).toHaveBeenCalledTimes(1);

        result.clearErrors();
        await nextTick();
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    it('no-ops when a 422 marks no field invalid', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {wrapper} = mountFieldForm(httpService, undefined, false);

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('scopes the scroll to scrollRoot when provided', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {wrapper} = mountScopedForm(httpService, true);

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center'});
        wrapper.unmount();
    });

    it('does not scroll to an invalid field outside scrollRoot', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const {wrapper} = mountScopedForm(httpService, false);

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not fall back to the document when scrollRoot is null', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const scrollRoot = ref<HTMLElement | null>(null); // passed but never bound -> stays null
        const {wrapper} = mountFieldForm(httpService, {scrollRoot});

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('scrolls with auto behavior under prefers-reduced-motion', async () => {
        const {httpService, triggerError} = createMockHttpService();
        vi.spyOn(window, 'matchMedia').mockReturnValue({matches: true} as MediaQueryList);
        const {wrapper} = mountFieldForm(httpService);

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'auto', block: 'center'});
        wrapper.unmount();
    });

    it('scrolls with smooth behavior when the runtime has no matchMedia', async () => {
        const {httpService, triggerError} = createMockHttpService();
        vi.stubGlobal('matchMedia', undefined);
        const {wrapper} = mountFieldForm(httpService);

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center'});
        wrapper.unmount();
    });

    it('scrolls after a child paints the mark from a prop (flush: post across the boundary)', async () => {
        const {httpService, triggerError} = createMockHttpService();
        const Field = defineComponent({
            props: {invalid: {type: Boolean, required: true}},
            setup: (props) => () => h('input', {'aria-invalid': props.invalid ? 'true' : 'false'}),
        });
        const wrapper = mount(
            defineComponent({
                setup() {
                    const {errors} = useForm(httpService, {scrollToError: true});
                    return () => h(Field, {invalid: Object.keys(errors.value).length > 0});
                },
            }),
            {attachTo: document.body},
        );

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    it('targets a custom scrollTarget selector instead of aria-invalid', async () => {
        const {httpService, triggerError} = createMockHttpService();
        let result!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    result = useForm(httpService, {scrollToError: true, scrollTarget: '.field-error'});
                    return () => h('input', {class: Object.keys(result.errors.value).length > 0 ? 'field-error' : ''});
                },
            }),
            {attachTo: document.body},
        );

        triggerError(422, {errors: {email: ['Taken']}});
        await nextTick();

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
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
        const {result} = mountForm(httpService, {fields: ['email']});

        triggerError(422, {errors: {email: ['Taken'], token: ['Expired']}});

        expect(result().errors.value).toEqual({email: 'Taken'});
        expect(result().unmapped.value).toEqual(['token']);
    });

    it('binds a 422 that arrives while the form is idle when onlyWhileSubmitting is off', () => {
        const {httpService, triggerError} = createMockHttpService();
        const {result} = mountForm(httpService);

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
        const {result} = mountForm<'email' | 'name' | 'learningGoals.0.title'>(httpService);

        expect(result().field('email')).toEqual({
            id: 'email',
            invalid: false,
            describedby: undefined,
            error: undefined,
        });

        triggerError(422, {errors: {email: ['Taken'], name: ['Required']}});
        result().refuse('name', 'Too short');

        expect(result().field('email')).toEqual({
            id: 'email',
            invalid: true,
            describedby: 'email-error',
            error: 'Taken',
        });
        expect(result().field('name').error).toBe('Too short');
        expect(result().field('learningGoals.0.title').id).toBe('learningGoals-0-title');
    });

    it('puts idPrefix before every derived id, so two forms with the same names can share a page', () => {
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
                    form = useForm<'firstName'>(httpService, options);
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

    it("keeps the message's element in place, empty, while the field is clean", () => {
        const {wrapper} = mountRow();
        const message = wrapper.find('p.ui-error');

        expect(message.exists()).toBe(true);
        expect(message.attributes('id')).toBe('firstName-error');
        expect(message.text()).toBe('');
    });
});
