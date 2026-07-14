import type {LabelKey} from '../types';

import {getLabel} from './label';

/**
 * Return a new array of options sorted alphabetically by their resolved label.
 * Non-mutating (copies first). Pure — testable in isolation from the SFC.
 */
export const sortByLabel = <T>(options: readonly T[], label: LabelKey<T>): T[] =>
    [...options].sort((a, b) => getLabel(a, label).localeCompare(getLabel(b, label)));
