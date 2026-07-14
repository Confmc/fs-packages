import {describe, expect, it} from 'vitest';

import {sortByLabel} from '../src/internal/sort';

type Fruit = {id: number; name: string};

describe('sortByLabel', () => {
    const fruits: Fruit[] = [
        {id: 1, name: 'Watermelon'},
        {id: 2, name: 'Apricot'},
        {id: 3, name: 'Mango'},
    ];

    it('returns options ordered alphabetically by their resolved label', () => {
        expect(sortByLabel(fruits, 'name').map((f) => f.name)).toEqual(['Apricot', 'Mango', 'Watermelon']);
    });

    it('does not mutate the input array', () => {
        const input = [...fruits];
        sortByLabel(input, 'name');
        expect(input.map((f) => f.name)).toEqual(['Watermelon', 'Apricot', 'Mango']);
    });

    it('supports a getter label', () => {
        expect(sortByLabel(fruits, (f) => f.name).map((f) => f.id)).toEqual([2, 3, 1]);
    });
});
