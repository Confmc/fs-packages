// @vitest-environment happy-dom
// useForm loads the form-bound FormLabel's SFC: under node it is compiled for SSR, a second copy the
// coverage report cannot merge with the one the component specs render.
// Type test (see path.spec.ts): FormDraft<T> turns a record into the form state a draft holds.
import {describe, expectTypeOf, it} from 'vitest';
import {ref} from 'vue';

import type {FormDraft, PathsOf, UseDraftForm} from '../../src';

import {useForm} from '../../src/form/form';

interface Contract {
    readonly name: string | null;
    readonly contractNumber: number;
    readonly debtorId: number;
    readonly careLegislationIds: readonly number[];
    readonly active: boolean;
    readonly startDate: string;
    readonly signedAt: Date;
    readonly attachment: File;
    readonly traject: {readonly notes: string};
    readonly learningGoals: readonly {readonly title: string}[];
    readonly tags: readonly string[];
}

const empty = (): FormDraft<Contract> => ({
    name: null,
    contractNumber: null,
    debtorId: null,
    careLegislationIds: [],
    active: false,
    startDate: null,
    signedAt: null,
    attachment: null,
    traject: {notes: null},
    learningGoals: [],
    tags: [],
});

describe('FormDraft', () => {
    it('makes every value a control can clear nullable, whatever the record says', () => {
        expectTypeOf<FormDraft<Contract>['name']>().toEqualTypeOf<string | null>();
        expectTypeOf<FormDraft<Contract>['startDate']>().toEqualTypeOf<string | null>();
        expectTypeOf<FormDraft<Contract>['contractNumber']>().toEqualTypeOf<number | null>();
        expectTypeOf<FormDraft<Contract>['debtorId']>().toEqualTypeOf<number | null>();
    });

    it('holds an optional member as a present, nullable field a control can bind', () => {
        interface Note {
            title: string;
            remark?: string;
        }

        expectTypeOf<FormDraft<Note>>().toEqualTypeOf<{title: string | null; remark: string | null}>();
        expectTypeOf<PathsOf<FormDraft<Note>, string | null>>().toEqualTypeOf<'title' | 'remark'>();
    });

    it('keeps a boolean a boolean: a checkbox is on or off', () => {
        expectTypeOf<FormDraft<Contract>['active']>().toEqualTypeOf<boolean>();
    });

    it('keeps a Date or a File whole, nullable', () => {
        expectTypeOf<FormDraft<Contract>['signedAt']>().toEqualTypeOf<Date | null>();
        expectTypeOf<FormDraft<Contract>['attachment']>().toEqualTypeOf<File | null>();
    });

    it('keeps a Map or a Set whole, nullable', () => {
        expectTypeOf<FormDraft<{byId: Map<number, string>}>['byId']>().toEqualTypeOf<Map<number, string> | null>();
        expectTypeOf<FormDraft<{chosen: Set<number>}>['chosen']>().toEqualTypeOf<Set<number> | null>();
    });

    it('keeps a list a list that empties to []: of values as they are, of objects as drafts', () => {
        expectTypeOf<FormDraft<Contract>['careLegislationIds']>().toEqualTypeOf<number[]>();
        expectTypeOf<FormDraft<Contract>['tags']>().toEqualTypeOf<string[]>();
        expectTypeOf<FormDraft<Contract>['learningGoals']>().toEqualTypeOf<{title: string | null}[]>();
    });

    it('drafts a nested object field by field', () => {
        expectTypeOf<FormDraft<Contract>['traject']>().toEqualTypeOf<{notes: string | null}>();
    });

    it('drops readonly: a draft is edited', () => {
        const draft = ref(empty());
        draft.value.name = 'Zorg';
        draft.value.careLegislationIds.push(1);
        draft.value.traject.notes = null;

        const record = {name: null} as Contract;
        // @ts-expect-error the record stays readonly
        record.name = 'Zorg';
    });

    it('gives a nullable text path where the record has a never-empty one', () => {
        expectTypeOf<'startDate'>().toExtend<PathsOf<FormDraft<Contract>, string | null>>();
        expectTypeOf<'traject.notes'>().toExtend<PathsOf<FormDraft<Contract>, string | null>>();
        expectTypeOf<'startDate'>().not.toExtend<PathsOf<Contract, string | null>>();
    });

    it('is a draft useForm names its fields by', () => {
        const draft = ref(empty());

        expectTypeOf(useForm({draft})).toEqualTypeOf<UseDraftForm<FormDraft<Contract>>>();
        useForm({draft, fields: ['learningGoals.0.title', 'traject.notes']});
    });
});
