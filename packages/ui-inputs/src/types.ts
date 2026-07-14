/** The minimal shape every option in a select must satisfy: a stable identity. */
export type SelectItem = {id: string | number};

/**
 * How to derive a display string from an option: either the name of a string
 * property on the option, or a getter function. Mirrors kendo's `getLabel` contract.
 */
export type LabelKey<T> = keyof T | ((option: T) => string);
