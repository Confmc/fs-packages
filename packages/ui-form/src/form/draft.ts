/** A value a form edits as a whole, even when it is an object: its own members are not fields. */
type Whole = Date | File | Blob | ((...args: never[]) => unknown);

/** One field's draft value: see `FormDraft`. */
type DraftValue<V> = [NonNullable<V>] extends [boolean]
    ? boolean
    : NonNullable<V> extends Whole
      ? NonNullable<V> | null
      : NonNullable<V> extends readonly (infer U)[]
        ? NonNullable<U> extends Whole | string | number | bigint | boolean
            ? NonNullable<U>[]
            : FormDraft<NonNullable<U>>[]
        : NonNullable<V> extends object
          ? FormDraft<NonNullable<V>>
          : NonNullable<V> | null;

/**
 * The form state for a record `T`: what a form's draft holds while the user edits it. Every value a
 * control can clear is nullable (`string | null`, `number | null`, a select's `id | null`), whatever
 * the record type says, because the text, number and select controls write `null` back on clear; the
 * server's validation decides what is required. A boolean stays `boolean` (a checkbox is on or off), a
 * list stays a list (an id list empties to `[]`, a list of objects holds drafts), a nested object stays
 * an object with drafted fields, and `readonly` goes (a draft is edited).
 *
 * `const draft = ref<FormDraft<Contract>>(…); useForm({draft})`.
 */
export type FormDraft<T> = {-readonly [K in keyof T]: DraftValue<T[K]>};
