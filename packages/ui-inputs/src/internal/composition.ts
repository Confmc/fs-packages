type TextField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Vue's `vModelText` composition rule for a text field the component binds by hand: an IME composes
 * one character through several `input` events, none of which is the user's value, so nothing is
 * committed while composing and the field's value is committed once on `compositionend`.
 */
export const commitOutsideComposition = (commit: (value: string) => void) => {
    let composing = false;

    return {
        onCompositionstart: (): void => {
            composing = true;
        },
        onCompositionend: (event: Event): void => {
            composing = false;
            commit((event.target as TextField).value);
        },
        onInput: (event: Event): void => {
            if (composing) return;
            commit((event.target as TextField).value);
        },
    };
};
