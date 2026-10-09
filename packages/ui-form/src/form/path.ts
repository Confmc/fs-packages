// Dotted paths into a draft (`learningGoals.0.title`), the same shape a keyMapped 422 names its fields.

/** How deep `Path` descends: a recursive draft type stops here instead of exploding the union. */
type Depth = [never, 0, 1, 2, 3, 4, 5, 6];

/** A value the path stops at, even though it is an object: its own keys are not fields. */
type Leaf = Date | File | Blob | ((...args: never[]) => unknown);

/** Every dotted path into `T`; an array index is any `${number}`. */
export type Path<T, D extends number = 6> = [D] extends [never]
    ? never
    : T extends Leaf
      ? never
      : T extends readonly (infer U)[]
        ? `${number}` | `${number}.${Path<U, Depth[D]>}`
        : T extends object
          ? {[K in keyof T & string]: K | `${K}.${Path<NonNullable<T[K]>, Depth[D]>}`}[keyof T & string]
          : never;

/** The value at a dotted path into `T`. */
export type PathValue<T, P extends string> = T extends readonly (infer U)[]
    ? P extends `${number}.${infer Rest}`
        ? PathValue<NonNullable<U>, Rest>
        : P extends `${number}`
          ? U
          : never
    : P extends `${infer K}.${infer Rest}`
      ? K extends keyof T
          ? PathValue<NonNullable<T[K]>, Rest>
          : never
      : P extends keyof T
        ? T[P]
        : never;

type Indexable = Record<string, unknown>;

/** Read a dotted path; a missing step on the way reads as `undefined`. */
export const readPath = (target: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((value, key) => (value == null ? undefined : (value as Indexable)[key]), target);

/** Write a dotted path. The step before the last must exist: a missing parent is a loud error, never a guess. */
export const writePath = (target: unknown, path: string, value: unknown): void => {
    const keys = path.split('.');
    const last = keys.pop() as string;
    const parent = keys.length ? readPath(target, keys.join('.')) : target;
    if (parent == null || typeof parent !== 'object')
        throw new Error(`[ui-form] cannot write "${path}": "${keys.join('.')}" is ${String(parent)}`);
    (parent as Indexable)[last] = value;
};
