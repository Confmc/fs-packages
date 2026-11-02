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
