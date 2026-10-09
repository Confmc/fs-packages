// @vitest-environment happy-dom
import type {AxiosAdapter, InternalAxiosRequestConfig} from 'axios';
import type {Component, VNode} from 'vue';

import {createHttpService} from '@script-development/fs-http';
import {mount} from '@vue/test-utils';
import {AxiosError} from 'axios';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick} from 'vue';

import type {UseForm} from '../../src';

import {CheckboxGroup, FormField, Textarea, TextInput, useForm} from '../../src';

// The end-to-end chain a consumer runs, now inside one package and read from SOURCE:
// a real HttpService answers 422 → fs-form's middleware fills the bag through keyMapper →
// form.field(name) reads the message from that form's bag → FormField draws it, v-bind marks and describes the control.

// A real 422 from emmie's care plan (UpdateCarePlanRequest, Dutch messages), raw snake keys.
const CARE_PLAN_422 = {
    message: 'x',
    errors: {
        client_first_name: ['Vul een voornaam in'],
        remarks: ['Vul geldige remarks in'],
        'traject.traject_type_id': ['Het traject.traject type id veld is verplicht wanneer traject aanwezig is'],
        'traject.start_date': ['Startdatum is geen geldige datum'],
        'learning_goals.0.title': ['Vul een titel in'],
        'learning_goals.1.description': ['Vul een omschrijving in'],
        'learning_goals.1.reasoning': ['Vul een onderbouwing in'],
    },
};

// The target keyMapper: camel each dot segment, keep the dots (`learning_goals.0.title` →
// `learningGoals.0.title`), so a template names a nested or indexed field the way it reads.
const camelSegment = (segment: string): string =>
    segment.replaceAll(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
const keyMapper = (key: string): string => key.split('.').map(camelSegment).join('.');

// Answers every request with this status and body, the way a server would.
const answering =
    (status: number, data: unknown): AxiosAdapter =>
    (config: InternalAxiosRequestConfig) =>
        Promise.reject(
            new AxiosError('refused', AxiosError.ERR_BAD_REQUEST, config, null, {
                status,
                statusText: '',
                headers: {},
                config,
                data,
            }),
        );

const care = createHttpService('https://emmie.test');
const send = (data: unknown, status = 422) => care.putRequest('/care-plan', {}, {adapter: answering(status, data)});

interface Mounted {
    form: UseForm;
    wrapper: ReturnType<typeof mount>;
}

// A field is written against the form it belongs to: the test passes each one that form.
type FieldNode = (form: UseForm) => VNode;

// Every form mounted on the shared service; unmounted after each case so none outlives it.
const mounted: ReturnType<typeof mount>[] = [];

const mountForm = (fields: () => FieldNode[], options = {}): Mounted => {
    let form!: UseForm;
    const wrapper = mount(
        defineComponent({
            setup: () => {
                // these cases send the 422 directly, outside a submit; the window case opts back in
                form = useForm(care, {keyMapper, onlyWhileSubmitting: false, ...options});

                return () =>
                    h(
                        'form',
                        fields().map((node) => node(form)),
                    );
            },
        }),
        {attachTo: document.body},
    );

    mounted.push(wrapper);

    return {form, wrapper};
};

const field =
    (name: string, control: Component = TextInput): FieldNode =>
    (form) => {
        const {id, error} = form.field(name);

        return h(
            FormField,
            {id, error, label: name},
            {default: ({field}: {field: object}) => h(control, {...field, modelValue: ''})},
        );
    };

// Every assertion a sighted and a screen-reader user both depend on, for one named field.
const expectMarked = (wrapper: ReturnType<typeof mount>, name: string, message: string) => {
    const root = wrapper.findAll('.ui-field').find((node) => node.find('label').text().startsWith(name));
    const control = root!.find('input, textarea');
    const describedby = control.attributes('aria-describedby');

    expect(control.attributes('aria-invalid')).toBe('true');
    expect(describedby).toBeDefined();
    expect(root!.find(`#${describedby}`).text()).toBe(message);
    expect(root!.find('label').attributes('for')).toBe(control.attributes('id'));
};

afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('a 422 reaches the field that names it', () => {
    it('marks every named field of the care plan, nested and indexed keys included', async () => {
        const {wrapper} = mountForm(() => [
            field('clientFirstName'),
            field('remarks', Textarea),
            field('traject.trajectTypeId'),
            field('traject.startDate'),
            field('learningGoals.0.title'),
            field('learningGoals.1.description', Textarea),
            field('learningGoals.1.reasoning', Textarea),
            field('learningGoals.0.description', Textarea),
        ]);

        await expect(send(CARE_PLAN_422)).rejects.toThrow();
        await nextTick();

        expectMarked(wrapper, 'clientFirstName', 'Vul een voornaam in');
        expectMarked(wrapper, 'remarks', 'Vul geldige remarks in');
        expectMarked(
            wrapper,
            'traject.trajectTypeId',
            'Het traject.traject type id veld is verplicht wanneer traject aanwezig is',
        );
        expectMarked(wrapper, 'traject.startDate', 'Startdatum is geen geldige datum');
        expectMarked(wrapper, 'learningGoals.0.title', 'Vul een titel in');
        expectMarked(wrapper, 'learningGoals.1.description', 'Vul een omschrijving in');
        expectMarked(wrapper, 'learningGoals.1.reasoning', 'Vul een onderbouwing in');
        // the one field the backend did not name stays clean
        expect(wrapper.findAll('.ui-error')).toHaveLength(7);
    });

    it('maps no two backend keys onto one name', async () => {
        const {form} = mountForm(() => []);

        await expect(send(CARE_PLAN_422)).rejects.toThrow();

        expect(Object.keys(form.errors.value)).toHaveLength(Object.keys(CARE_PLAN_422.errors).length);
        expect(form.unmapped.value).toEqual([]);
    });

    it('scrolls the first marked control into view when the form asks for it', async () => {
        const scroll = vi.fn();
        vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scroll);
        const {wrapper} = mountForm(() => [field('clientFirstName'), field('remarks', Textarea)], {
            scrollToError: true,
        });

        await expect(send({errors: {remarks: ['Te lang']}})).rejects.toThrow();
        await nextTick();

        expect(scroll).toHaveBeenCalledOnce();
        expect(scroll.mock.contexts[0]).toBe(wrapper.find('textarea').element);
    });

    it('carries a group error on the fieldset and never on its boxes', async () => {
        const {wrapper} = mountForm(() => [
            (form) =>
                h(
                    FormField,
                    {id: form.field('goals').id, error: form.field('goals').error},
                    {
                        default: ({field}: {field: object}) =>
                            h(CheckboxGroup, {
                                ...field,
                                options: [{id: 1, name: 'Werk'}],
                                optionLabel: 'name',
                                label: 'Doelen',
                                modelValue: [],
                            }),
                    },
                ),
        ]);

        await expect(send({errors: {goals: ['Kies een doel']}})).rejects.toThrow();
        await nextTick();

        const fieldset = wrapper.find('fieldset');
        expect(fieldset.attributes('aria-invalid')).toBe('true');
        expect(wrapper.find(`#${fieldset.attributes('aria-describedby')}`).text()).toBe('Kies een doel');
        expect(wrapper.find('input[type="checkbox"]').attributes('aria-describedby')).toBeUndefined();
    });

    it('takes a 422 from a request that is not a submit, as the address lookup relies on', async () => {
        const {wrapper} = mountForm(() => [field('zipcode')]);

        await expect(
            care.getRequest('/address-lookup', {adapter: answering(422, {errors: {zipcode: ['Onbekende postcode']}})}),
        ).rejects.toThrow();
        await nextTick();

        expectMarked(wrapper, 'zipcode', 'Onbekende postcode');
    });

    it('shows only its own 422 when two forms share the service but not a submit window', async () => {
        const first = mountForm(() => [field('name')], {onlyWhileSubmitting: true});
        const second = mountForm(() => [field('name')], {onlyWhileSubmitting: true});

        await second.form.handleSubmit(() => send({errors: {name: ['Vul een naam in']}}));
        await nextTick();

        expect(first.wrapper.find('.ui-error').exists()).toBe(false);
        expect(second.wrapper.find('.ui-error').text()).toBe('Vul een naam in');
    });
});

describe('client refusals share the bag', () => {
    it('shows a refusal the form made itself, before any request', async () => {
        const {form, wrapper} = mountForm(() => [field('name'), field('url')]);

        form.refuse('name', 'Vul een naam in');
        await nextTick();

        expectMarked(wrapper, 'name', 'Vul een naam in');
        expect(wrapper.findAll('.ui-error')).toHaveLength(1);
    });

    it('keeps client refusals through a submit, which clears only the server errors', async () => {
        const {form, wrapper} = mountForm(() => [field('name'), field('url')]);

        await form.handleSubmit(() => send({errors: {url: ['Ongeldige url']}}));
        form.refuse('name', 'Vul een naam in');
        await form.handleSubmit(() => Promise.resolve());
        await nextTick();

        expect(form.errors.value).toEqual({});
        expectMarked(wrapper, 'name', 'Vul een naam in');
        expect(wrapper.findAll('.ui-error')).toHaveLength(1);
    });

    it('lets the client refusal win over the server on the same field', async () => {
        const {form, wrapper} = mountForm(() => [field('name')]);

        await form.handleSubmit(() => send({errors: {name: ['Server zegt nee']}}));
        form.refuse('name', 'Client zegt nee');
        await nextTick();

        expect(wrapper.find('.ui-error').text()).toBe('Client zegt nee');
    });

    it('withdraws per field, and clears all client refusals at once', async () => {
        const {form, wrapper} = mountForm(() => [field('name'), field('url'), field('kvkNumber')]);

        form.refuse('name', 'Vul een naam in');
        form.refuse('url', 'Ongeldige url');
        form.refuse('kvkNumber', 'Ongeldig KvK-nummer');
        form.withdraw('name', 'url');
        await nextTick();

        expect(form.clientErrors.value).toEqual({kvkNumber: 'Ongeldig KvK-nummer'});
        expect(wrapper.findAll('.ui-error')).toHaveLength(1);

        form.clearClient();
        await nextTick();

        expect(wrapper.findAll('.ui-error')).toHaveLength(0);
    });

    it('sets the whole client verdict from a bag, and says whether it refused anything', async () => {
        const {form, wrapper} = mountForm(() => [field('name'), field('url'), field('kvkNumber')]);

        expect(form.setRefusals({name: 'Vul een naam in', url: 'Ongeldige url', kvkNumber: ''})).toBe(true);
        await nextTick();

        expectMarked(wrapper, 'name', 'Vul een naam in');
        expectMarked(wrapper, 'url', 'Ongeldige url');
        expect(form.clientErrors.value).toEqual({name: 'Vul een naam in', url: 'Ongeldige url'});

        // the next check replaces the verdict: the fixed field is no longer refused
        expect(form.setRefusals({url: 'Ongeldige url'})).toBe(true);
        await nextTick();
        expect(form.clientErrors.value).toEqual({url: 'Ongeldige url'});
        expect(wrapper.findAll('.ui-error')).toHaveLength(1);

        // a clean draft refuses nothing and clears the client layer
        expect(form.setRefusals({})).toBe(false);
        expect(form.setRefusals({name: undefined, url: ''})).toBe(false);
        await nextTick();
        expect(wrapper.findAll('.ui-error')).toHaveLength(0);
    });

    it('leaves the server errors alone when it sets the client verdict', async () => {
        const {form, wrapper} = mountForm(() => [field('name'), field('url')]);

        await form.handleSubmit(() => send({errors: {url: ['Server zegt nee']}}));
        form.setRefusals({});
        await nextTick();

        expect(wrapper.find('.ui-error').text()).toBe('Server zegt nee');
    });

    it('still re-throws what is not a refusal', async () => {
        const {form} = mountForm(() => [field('name')]);

        await expect(form.handleSubmit(() => send({message: 'boom'}, 500))).rejects.toThrow();
        expect(form.fieldErrors.value).toEqual({});
    });
});
