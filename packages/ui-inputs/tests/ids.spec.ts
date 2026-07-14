import {describe, expect, it} from 'vitest';

import {fieldErrorId} from '../src/internal/ids';

describe('fieldErrorId', () => {
    it('suffixes the control id with -error', () => {
        expect(fieldErrorId('email')).toBe('email-error');
    });
});
