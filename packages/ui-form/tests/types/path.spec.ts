// Type test: `npm run typecheck` checks this file with vue-tsc (tsconfig.types.json). Every expectTypeOf
// line and every @ts-expect-error is an assertion; a loosened type fails the typecheck, not the run.
import {describe, expectTypeOf, it} from 'vitest';

import type {Path, PathsFor, PathsOf, PathValue} from '../../src';

interface Goal {
    title: string | null;
    tags: string[];
}

interface Draft {
    firstName: string | null;
    age: number;
    born: Date;
    attachment: File | null;
    onSave: () => void;
    learningGoals: Goal[];
    address: {street: string; city: string | null} | null;
    parent: Draft | null;
}

describe('Path', () => {
    it('names every key, nested key and array index of a draft, dotted', () => {
        expectTypeOf<'firstName'>().toExtend<Path<Draft>>();
        expectTypeOf<'address.street'>().toExtend<Path<Draft>>();
        expectTypeOf<'learningGoals.0.title'>().toExtend<Path<Draft>>();
        expectTypeOf<'learningGoals.12.tags.3'>().toExtend<Path<Draft>>();
        expectTypeOf<'learningGoals'>().toExtend<Path<Draft>>();
    });

    it('descends through a nullable object', () => {
        expectTypeOf<'parent.learningGoals.3.title'>().toExtend<Path<Draft>>();
        expectTypeOf<'address.city'>().toExtend<Path<Draft>>();
    });

    it('names no path that is not in the draft', () => {
        expectTypeOf<'frstName'>().not.toExtend<Path<Draft>>();
        expectTypeOf<'firstName.length'>().not.toExtend<Path<Draft>>();
        expectTypeOf<'learningGoals.first.title'>().not.toExtend<Path<Draft>>();
        expectTypeOf<'learningGoals.0.titel'>().not.toExtend<Path<Draft>>();
    });

    it('stops at a Date, a File and a function: their own members are not fields', () => {
        expectTypeOf<'born'>().toExtend<Path<Draft>>();
        expectTypeOf<'born.getTime'>().not.toExtend<Path<Draft>>();
        expectTypeOf<'attachment.name'>().not.toExtend<Path<Draft>>();
        expectTypeOf<'onSave.call'>().not.toExtend<Path<Draft>>();
    });

    it('stops at a Map and a Set: their size and methods are not fields', () => {
        interface Picks {
            byId: Map<number, string>;
            chosen: ReadonlySet<number>;
        }

        expectTypeOf<Path<Picks>>().toEqualTypeOf<'byId' | 'chosen'>();
    });

    it('stops descending a recursive draft at a fixed depth', () => {
        expectTypeOf<'parent.parent.parent.parent.parent.parent.firstName'>().toExtend<Path<Draft>>();
        expectTypeOf<'parent.parent.parent.parent.parent.parent.parent.firstName'>().not.toExtend<Path<Draft>>();
    });

    it('is never for a value that has no fields', () => {
        expectTypeOf<Path<string>>().toBeNever();
        expectTypeOf<Path<Date>>().toBeNever();
    });
});

describe('PathValue', () => {
    it('is the value at a path, nested and indexed', () => {
        expectTypeOf<PathValue<Draft, 'firstName'>>().toEqualTypeOf<string | null>();
        expectTypeOf<PathValue<Draft, 'age'>>().toEqualTypeOf<number>();
        expectTypeOf<PathValue<Draft, 'learningGoals.0.title'>>().toEqualTypeOf<string | null>();
        expectTypeOf<PathValue<Draft, 'learningGoals.0.tags.1'>>().toEqualTypeOf<string>();
        expectTypeOf<PathValue<Draft, 'learningGoals.0'>>().toEqualTypeOf<Goal>();
        expectTypeOf<PathValue<Draft, 'born'>>().toEqualTypeOf<Date>();
    });

    it('reads through a nullable object as the value its path names', () => {
        expectTypeOf<PathValue<Draft, 'address.street'>>().toEqualTypeOf<string>();
        expectTypeOf<PathValue<Draft, 'parent.learningGoals.3.title'>>().toEqualTypeOf<string | null>();
    });

    it('is never for a path that is not in the draft', () => {
        expectTypeOf<PathValue<Draft, 'frstName'>>().toBeNever();
        expectTypeOf<PathValue<Draft, 'address.zip'>>().toBeNever();
        expectTypeOf<PathValue<Draft, 'learningGoals.first'>>().toBeNever();
        expectTypeOf<PathValue<Draft, 'learningGoals.first.title'>>().toBeNever();
    });
});

interface Fields {
    name: string | null;
    code: string;
    age: number | null;
    count: number;
    active: boolean;
    ids: number[];
    note: {text: string | null};
}

describe('PathsOf', () => {
    it('picks the paths whose value is exactly the given type, at any depth', () => {
        expectTypeOf<PathsOf<Fields, string | null>>().toEqualTypeOf<'name' | 'note.text'>();
        expectTypeOf<PathsOf<Fields, number | null>>().toEqualTypeOf<'age'>();
        expectTypeOf<PathsOf<Fields, boolean>>().toEqualTypeOf<'active'>();
        expectTypeOf<PathsOf<Fields, number[]>>().toEqualTypeOf<'ids'>();
        expectTypeOf<PathsOf<Fields, number>>().toEqualTypeOf<'count' | `ids.${number}`>();
    });
});

describe('PathsFor', () => {
    it('picks a path whose value takes everything written, though the control reads more', () => {
        // a control that reads string | null but writes only strings binds a string path too
        expectTypeOf<PathsFor<Fields, string | null, string>>().toEqualTypeOf<'name' | 'code' | 'note.text'>();
    });

    it('leaves out a path whose value the control cannot read', () => {
        // a control that reads only strings cannot show a null
        expectTypeOf<PathsFor<Fields, string, string>>().toEqualTypeOf<'code'>();
    });

    it('leaves out a path whose value cannot take what the control writes', () => {
        // a control that writes null on clear cannot bind a never-empty number
        expectTypeOf<PathsFor<Fields, number | null, number | null>>().toEqualTypeOf<'age'>();
    });
});
