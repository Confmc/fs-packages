import {describe, expect, it} from 'vitest';

import {reduceSelectKey} from '../src/internal/select-keyboard';

const OPEN = {open: true, pointer: -1};
const CLOSED = {open: false, pointer: -1};

describe('reduceSelectKey', () => {
    describe('Tab', () => {
        it('closes and clears the pointer from any state, without preventing default', () => {
            expect(reduceSelectKey({open: true, pointer: 2}, 'Tab', 5)).toEqual({
                open: false,
                pointer: -1,
                commit: false,
                preventDefault: false,
            });
        });
    });

    describe('while closed', () => {
        it.each(['Enter', 'ArrowDown', ' '])('opens on %s, preserves pointer, and prevents default', (key) => {
            expect(reduceSelectKey({open: false, pointer: 3}, key, 5)).toEqual({
                open: true,
                pointer: 3,
                commit: false,
                preventDefault: true,
            });
        });

        it('ignores a non-opening key and does not prevent default', () => {
            expect(reduceSelectKey(CLOSED, 'a', 5)).toEqual({
                open: false,
                pointer: -1,
                commit: false,
                preventDefault: false,
            });
        });
    });

    describe('while open — ArrowDown', () => {
        it('advances the pointer', () => {
            expect(reduceSelectKey({open: true, pointer: 0}, 'ArrowDown', 3)).toEqual({
                open: true,
                pointer: 1,
                commit: false,
                preventDefault: true,
            });
        });

        it('clamps at the last option', () => {
            expect(reduceSelectKey({open: true, pointer: 2}, 'ArrowDown', 3).pointer).toBe(2);
        });
    });

    describe('while open — ArrowUp', () => {
        it('retreats the pointer', () => {
            expect(reduceSelectKey({open: true, pointer: 2}, 'ArrowUp', 3)).toEqual({
                open: true,
                pointer: 1,
                commit: false,
                preventDefault: true,
            });
        });

        it('clamps at -1', () => {
            expect(reduceSelectKey({open: true, pointer: -1}, 'ArrowUp', 3).pointer).toBe(-1);
        });
    });

    describe('while open — Enter', () => {
        it('commits and closes when an option is highlighted (pointer 0 counts)', () => {
            expect(reduceSelectKey({open: true, pointer: 0}, 'Enter', 3)).toEqual({
                open: false,
                pointer: -1,
                commit: true,
                preventDefault: true,
            });
        });

        it('does nothing when no option is highlighted', () => {
            expect(reduceSelectKey({open: true, pointer: -1}, 'Enter', 3)).toEqual({
                open: true,
                pointer: -1,
                commit: false,
                preventDefault: false,
            });
        });
    });

    describe('while open — Escape', () => {
        it('closes and clears the pointer, preventing default', () => {
            expect(reduceSelectKey({open: true, pointer: 2}, 'Escape', 3)).toEqual({
                open: false,
                pointer: -1,
                commit: false,
                preventDefault: true,
            });
        });
    });

    describe('while open — unhandled key', () => {
        it('leaves state untouched and does not prevent default', () => {
            expect(reduceSelectKey({open: true, pointer: 1}, 'x', 3)).toEqual({
                open: true,
                pointer: 1,
                commit: false,
                preventDefault: false,
            });
        });
    });

    it('does not open a select on Escape while closed (default branch)', () => {
        expect(reduceSelectKey(OPEN, 'Escape', 3).open).toBe(false);
    });
});
