import type {LabelKey} from '../types';

/**
 * Resolve an option's display string from a `LabelKey` (property name or getter).
 * Pure — extracted from the SFC so it is unit- and mutation-testable.
 */
export const getLabel = <T>(option: T, label: LabelKey<T>): string =>
    typeof label === 'function'
        ? label(option)
        : String((option as Record<PropertyKey, unknown>)[label as PropertyKey]);
