import {describe, expect, it} from 'vitest';

import {getLabel} from '../src/internal/label';

describe('getLabel', () => {
    it('resolves a string property by key', () => {
        expect(getLabel({id: 1, name: 'Kiwi'}, 'name')).toBe('Kiwi');
    });

    it('resolves via a getter function', () => {
        expect(getLabel({id: 1, first: 'Ada', last: 'Lovelace'}, (o) => `${o.first} ${o.last}`)).toBe('Ada Lovelace');
    });

    it('coerces a non-string property value to a string', () => {
        expect(getLabel({id: 1, count: 42}, 'count')).toBe('42');
    });
});
