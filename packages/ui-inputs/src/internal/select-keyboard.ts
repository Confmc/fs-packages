/** Immutable snapshot of the select's interactive state. */
export type SelectKeyState = {open: boolean; pointer: number};

/**
 * Result of a keypress: the next state, whether the highlighted option should be
 * committed (selected), and whether the browser default should be prevented.
 */
export type SelectKeyResult = SelectKeyState & {commit: boolean; preventDefault: boolean};

/** Keys that open a closed select. */
const OPEN_KEYS = ['Enter', 'ArrowDown', ' '];

/**
 * Pure reducer for the select's keyboard interaction — the behavioural core that
 * kendo/emmie/ublgenie each re-implemented inline. Extracted from the SFC so it can
 * be exhaustively unit- and mutation-tested (Stryker mutates `.ts`, not `.vue`).
 *
 * The SFC owns only the wiring: apply `open`/`pointer`, honour `preventDefault`,
 * and commit the pointed option when `commit` is true.
 */
export const reduceSelectKey = (state: SelectKeyState, key: string, optionCount: number): SelectKeyResult => {
    const {open, pointer} = state;

    if (key === 'Tab') return {open: false, pointer: -1, commit: false, preventDefault: false};

    if (!open) {
        if (OPEN_KEYS.includes(key)) return {open: true, pointer, commit: false, preventDefault: true};
        return {open, pointer, commit: false, preventDefault: false};
    }

    switch (key) {
        case 'ArrowDown':
            return {open, pointer: Math.min(pointer + 1, optionCount - 1), commit: false, preventDefault: true};
        case 'ArrowUp':
            return {open, pointer: Math.max(pointer - 1, -1), commit: false, preventDefault: true};
        case 'Enter':
            return pointer >= 0
                ? {open: false, pointer: -1, commit: true, preventDefault: true}
                : {open, pointer, commit: false, preventDefault: false};
        case 'Escape':
            return {open: false, pointer: -1, commit: false, preventDefault: true};
        default:
            return {open, pointer, commit: false, preventDefault: false};
    }
};
