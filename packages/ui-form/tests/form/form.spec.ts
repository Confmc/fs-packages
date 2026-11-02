// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick, ref} from 'vue';

import type {UseForm, UseFormOptions} from '../../src';

import {useForm} from '../../src';

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

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useForm', () => {
    it('hands out the validation bag, take, clearErrors, handleSubmit and submitting from one call', () => {
        const form = useForm();

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
        const form = useForm<'email'>();

        await expect(form.handleSubmit(refusedWith({email: ['Taken']}))).resolves.toBe('refused');

        expect(form.errors.value).toEqual({email: 'Taken'});
        expect(form.refused.value).toBe(true);
    });

    it('keeps a dotted path as the backend sent it when no keyMapper is given', async () => {
        const form = useForm();

        await form.handleSubmit(refusedWith({'learningGoals.0.title': ['Required']}));

        expect(form.errors.value).toEqual({'learningGoals.0.title': 'Required'});
    });

    it('passes keyMapper through to the validation bag', async () => {
        const camel = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
        const form = useForm({keyMapper: camel});

        await form.handleSubmit(refusedWith({street_name: ['Required']}));

        expect(form.errors.value).toEqual({streetName: 'Required'});
    });

    it('passes the fields allow-list through to the validation bag', async () => {
        const form = useForm({fields: ['email']});

        await form.handleSubmit(refusedWith({email: ['Taken'], token: ['Expired']}));

        expect(form.errors.value).toEqual({email: 'Taken'});
        expect(form.unmapped.value).toEqual(['token']);
        expect(form.refusedUnnamed.value).toBe(false);
    });

    it('signals a refusal that names no field the form holds', async () => {
        const form = useForm({fields: ['password']});

        await expect(form.handleSubmit(refusedWith({token: ['Expired']}))).resolves.toBe('refused');

        expect(form.refused.value).toBe(true);
        expect(form.refusedUnnamed.value).toBe(true);
        expect(form.unmapped.value).toEqual(['token']);
    });

    it("toggles submitting around the action and clears the messages when it resolves ('sent')", async () => {
        const form = useForm<'email'>();
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
        const form = useForm<'email'>();
        await form.handleSubmit(refusedWith({email: ['Taken']}));

        await expect(form.handleSubmit(async () => false)).resolves.toBe('cancelled');

        expect(form.errors.value).toEqual({email: 'Taken'});
    });

    it("ignores a submit while one is in flight ('ignored')", async () => {
        const form = useForm();
        const gate = deferred();
        const action = vi.fn(() => gate.promise);

        const first = form.handleSubmit(action);
        await expect(form.handleSubmit(action)).resolves.toBe('ignored');
        expect(action).toHaveBeenCalledOnce();

        gate.resolve();
        await expect(first).resolves.toBe('sent');
    });

    it('re-throws any other rejection and leaves the messages as they were', async () => {
        const form = useForm<'email'>();
        await form.handleSubmit(refusedWith({email: ['Taken']}));
        const error = requestError(500);

        await expect(form.handleSubmit(() => Promise.reject(error))).rejects.toBe(error);

        expect(form.errors.value).toEqual({email: 'Taken'});
        expect(form.submitting.value).toBe(false);
    });

    it('holds nothing of a 422 its action catches itself', async () => {
        const form = useForm();

        await form.handleSubmit(() => refusedWith({email: ['Taken']})().catch(() => undefined));

        expect(form.errors.value).toEqual({});
        expect(form.refused.value).toBe(false);
    });

    it('binds a 422 caught outside a submit through take', () => {
        const form = useForm<'email'>();

        expect(form.take(requestError(422, {errors: {email: ['Taken']}}))).toBe(true);

        expect(form.errors.value).toEqual({email: 'Taken'});
    });

    it('keeps one form out of another form’s refusals', async () => {
        const page = useForm<'email'>();
        const dialog = useForm<'email'>();

        await dialog.handleSubmit(refusedWith({email: ['Taken']}));

        expect(dialog.errors.value).toEqual({email: 'Taken'});
        expect(page.errors.value).toEqual({});
        expect(page.refused.value).toBe(false);
    });

    it('clearErrors empties a filled bag', async () => {
        const form = useForm<'email'>();
        await form.handleSubmit(refusedWith({email: ['Taken']}));

        form.clearErrors();

        expect(form.errors.value).toEqual({});
        expect(form.refused.value).toBe(false);
    });
});

describe('useForm scroll-to-error', () => {
    let scrollIntoView: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    });

    const invalidWhileRefused = (form: UseForm) => (Object.keys(form.errors.value).length > 0 ? 'true' : 'false');

    // Mounts (attached to the document) a form that renders one field marked `aria-invalid` while the
    // error bag is non-empty: the shape the scroll queries for. The scroll is opt-in; these cases are
    // about what it does once asked for.
    const mountFieldForm = (options?: UseFormOptions, markInvalid = true) => {
        let form!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm({scrollToError: true, ...options});
                    return () => h('input', {'aria-invalid': markInvalid ? invalidWhileRefused(form) : 'false'});
                },
            }),
            {attachTo: document.body},
        );
        return {wrapper, form: () => form};
    };

    // Mounts (attached) a form whose invalid field sits inside or outside a `scrollRoot` element.
    const mountScopedForm = (fieldInsideRoot: boolean) => {
        const scrollRoot = ref<HTMLElement | null>(null);
        let form!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm({scrollToError: true, scrollRoot});
                    const field = () => h('input', {'aria-invalid': invalidWhileRefused(form)});
                    return () =>
                        h('div', [
                            h('div', {ref: scrollRoot}, [fieldInsideRoot ? field() : null]),
                            fieldInsideRoot ? null : field(),
                        ]);
                },
            }),
            {attachTo: document.body},
        );
        return {wrapper, form: () => form};
    };

    it('scrolls the first invalid field into view after a refusal', async () => {
        const {wrapper, form} = mountFieldForm();

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({behavior: 'smooth', block: 'center'});
        wrapper.unmount();
    });

    it('scrolls to the first invalid field in document order when several are marked', async () => {
        let form!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm({scrollToError: true});
                    const field = () => h('input', {'aria-invalid': invalidWhileRefused(form)});
                    return () => h('div', [field(), field()]);
                },
            }),
            {attachTo: document.body},
        );

        await form.handleSubmit(refusedWith({email: ['Taken']}));

        const invalid = document.querySelectorAll('[aria-invalid="true"]');
        expect(invalid).toHaveLength(2);
        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(invalid[0]);
        wrapper.unmount();
    });

    it.each([
        ['when scrollToError is left out', {scrollToError: undefined}],
        ['when scrollToError is false', {scrollToError: false}],
    ])('does not scroll %s', async (_, options) => {
        const {wrapper, form} = mountFieldForm(options);

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    // A form whose own field is marked while its bag holds errors, beside a field that stays invalid
    // on its own, unrelated to this form's bag.
    const mountBesideInvalid = (options?: UseFormOptions) => {
        let form!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm({scrollToError: true, ...options});
                    return () =>
                        h('div', [
                            h('input', {'aria-invalid': 'true'}),
                            h('input', {'aria-invalid': invalidWhileRefused(form)}),
                        ]);
                },
            }),
            {attachTo: document.body},
        );
        return {wrapper, form: () => form};
    };

    it('does not scroll for a 422 taken outside a submit', async () => {
        const {wrapper, form} = mountFieldForm();

        form().take(requestError(422, {errors: {email: ['Taken']}}));
        await nextTick();

        expect(document.querySelector('[aria-invalid="true"]')).not.toBeNull();
        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not scroll to another marked field when the refusal names none this form holds', async () => {
        const {wrapper, form} = mountBesideInvalid({fields: ['password']});

        await expect(form().handleSubmit(refusedWith({token: ['Expired']}))).resolves.toBe('refused');

        expect(form().refusedUnnamed.value).toBe(true);
        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it("does not scroll when the next submit ends 'cancelled', though its messages still stand", async () => {
        const {wrapper, form} = mountBesideInvalid();
        await form().handleSubmit(refusedWith({email: ['Taken']}));
        scrollIntoView.mockClear();

        await expect(form().handleSubmit(async () => false)).resolves.toBe('cancelled');

        expect(form().errors.value).toEqual({email: 'Taken'});
        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it("does not scroll once a 'sent' submit empties the bag", async () => {
        const {wrapper, form} = mountBesideInvalid();
        await form().handleSubmit(refusedWith({email: ['Taken']}));
        scrollIntoView.mockClear();

        await expect(form().handleSubmit(async () => {})).resolves.toBe('sent');

        expect(form().errors.value).toEqual({});
        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    // The current limitation: without `scrollRoot` the lookup is document-wide, so a form can scroll to a
    // field another form marks. Looking the field up by the form's own ids ends this; the case flips then.
    it("scrolls a dialog's refusal to the page form's field, as the lookup is document-wide without scrollRoot", async () => {
        const page = mountFieldForm();
        const dialog = mountFieldForm();
        await page.form().handleSubmit(refusedWith({email: ['Taken']}));
        scrollIntoView.mockClear();

        await dialog.form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(scrollIntoView.mock.contexts[0]).toBe(page.wrapper.element);
        expect(scrollIntoView.mock.contexts[0]).not.toBe(dialog.wrapper.element);
        dialog.wrapper.unmount();
        page.wrapper.unmount();
    });

    it('does nothing when a refusal marks no field invalid', async () => {
        const {wrapper, form} = mountFieldForm(undefined, false);

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('scrolls to an invalid field inside scrollRoot', async () => {
        const {wrapper, form} = mountScopedForm(true);

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledOnce();
        wrapper.unmount();
    });

    it('does not scroll to an invalid field outside scrollRoot', async () => {
        const {wrapper, form} = mountScopedForm(false);

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not fall back to the document when scrollRoot is null', async () => {
        // passed but never bound, so it stays null
        const {wrapper, form} = mountFieldForm({scrollRoot: ref<HTMLElement | null>(null)});

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('scrolls with auto behavior under prefers-reduced-motion', async () => {
        const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({matches: true} as MediaQueryList);
        const {wrapper, form} = mountFieldForm();

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
        expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({behavior: 'auto', block: 'center'});
        wrapper.unmount();
    });

    it('scrolls with smooth behavior when the runtime has no matchMedia', async () => {
        vi.stubGlobal('matchMedia', undefined);
        const {wrapper, form} = mountFieldForm();

        await form().handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({behavior: 'smooth', block: 'center'});
        wrapper.unmount();
    });

    it('scrolls after a child paints the mark from a prop', async () => {
        const Field = defineComponent({
            props: {invalid: {type: Boolean, required: true}},
            setup: (props) => () => h('input', {'aria-invalid': props.invalid ? 'true' : 'false'}),
        });
        let form!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm({scrollToError: true});
                    return () => h(Field, {invalid: Object.keys(form.errors.value).length > 0});
                },
            }),
            {attachTo: document.body},
        );

        await form.handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledOnce();
        wrapper.unmount();
    });

    it('targets a custom scrollTarget selector instead of aria-invalid', async () => {
        let form!: UseForm;
        const wrapper = mount(
            defineComponent({
                setup() {
                    form = useForm({scrollToError: true, scrollTarget: '.field-error'});
                    return () => h('input', {class: Object.keys(form.errors.value).length > 0 ? 'field-error' : ''});
                },
            }),
            {attachTo: document.body},
        );

        await form.handleSubmit(refusedWith({email: ['Taken']}));

        expect(scrollIntoView).toHaveBeenCalledOnce();
        wrapper.unmount();
    });
});
