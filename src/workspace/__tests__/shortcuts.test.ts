import { describe, expect, it } from 'vitest';
import {
    isTextBox,
    matchShortcut,
    SHORTCUTS,
    shortcutLabel,
    shortcutById,
} from '../shortcuts';

const press = (
    key: string,
    extra: Partial<Parameters<typeof matchShortcut>[0]> = {}
) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...extra,
});
const id = (event: ReturnType<typeof press>, mac = false, inTextBox = false) =>
    matchShortcut(event, { mac, inTextBox })?.id;

describe('keyboard shortcuts (EDT-217, EDT-218, EDT-256, SHL-032)', () => {
    it('lists every shortcut of the spec table once', () => {
        const ids = SHORTCUTS.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(
            expect.arrayContaining([
                'undo',
                'redo',
                'openDiagram',
                'save',
                'togglePanel',
                'fitAll',
                'toggleTheme',
                'toggleFilter',
                'copyTables',
                'pasteTables',
                'removeSelection',
            ])
        );
    });

    it('SHL-050: each key has one listener: the canvas owns fit, copy, paste and delete', () => {
        const owner = (shortcutId: string) =>
            SHORTCUTS.find((s) => s.id === shortcutId)?.owner;
        for (const shortcutId of [
            'fitAll',
            'copyTables',
            'pasteTables',
            'removeSelection',
        ])
            expect(owner(shortcutId), shortcutId).toBe('canvas');
        for (const shortcutId of [
            'undo',
            'redo',
            'save',
            'togglePanel',
            'toggleTheme',
            'toggleFilter',
        ])
            expect(owner(shortcutId), shortcutId).toBe('workspace');
    });

    it('Ctrl does the work on Windows and Linux, Cmd on a Mac', () => {
        expect(id(press('z', { ctrlKey: true }))).toBe('undo');
        expect(id(press('z', { metaKey: true }))).toBeUndefined();
        expect(id(press('z', { metaKey: true }), true)).toBe('undo');
        expect(id(press('z', { ctrlKey: true }), true)).toBeUndefined();
    });

    it('Shift makes redo of undo, and a capital letter still matches', () => {
        expect(id(press('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
        expect(id(press('z', { ctrlKey: true, shiftKey: false }))).toBe('undo');
    });

    it('maps the other keys', () => {
        const ctrl = (key: string) => id(press(key, { ctrlKey: true }));
        expect(ctrl('o')).toBe('openDiagram');
        expect(ctrl('s')).toBe('save');
        expect(ctrl('b')).toBe('togglePanel');
        expect(ctrl('0')).toBe('fitAll');
        expect(ctrl('m')).toBe('toggleTheme');
        expect(ctrl('f')).toBe('toggleFilter');
        expect(ctrl('c')).toBe('copyTables');
        expect(ctrl('v')).toBe('pasteTables');
        expect(id(press('Delete'))).toBe('removeSelection');
    });

    it('ignores a key with Alt held or without Mod', () => {
        expect(id(press('z'))).toBeUndefined();
        expect(id(press('z', { ctrlKey: true, altKey: true }))).toBeUndefined();
    });

    it('only the theme and filter keys work inside a text box (EDT-221, EDT-256)', () => {
        expect(id(press('z', { ctrlKey: true }), false, true)).toBeUndefined();
        expect(id(press('s', { ctrlKey: true }), false, true)).toBeUndefined();
        expect(id(press('m', { ctrlKey: true }), false, true)).toBe(
            'toggleTheme'
        );
        expect(id(press('f', { ctrlKey: true }), false, true)).toBe(
            'toggleFilter'
        );
    });

    it('labels follow the platform', () => {
        expect(shortcutLabel(shortcutById('redo'), false)).toBe('Ctrl+Shift+Z');
        expect(shortcutLabel(shortcutById('redo'), true)).toBe('⌘⇧Z');
        expect(shortcutLabel(shortcutById('fitAll'), false)).toBe('Ctrl+0');
    });

    it('recognises boxes that take typed text', () => {
        const input = document.createElement('input');
        const box = document.createElement('input');
        box.type = 'checkbox';
        expect(isTextBox(input)).toBe(true);
        expect(isTextBox(document.createElement('textarea'))).toBe(true);
        expect(isTextBox(box)).toBe(false);
        expect(isTextBox(document.createElement('div'))).toBe(false);
        expect(isTextBox(null)).toBe(false);
    });
});

describe('review ui 13: Ctrl+Y redoes on Windows and Linux', () => {
    it('matches redo without Shift, not on a Mac, not in a text box', () => {
        expect(id(press('y', { ctrlKey: true }))).toBe('redo');
        expect(id(press('y', { metaKey: true }), true)).toBeUndefined();
        expect(id(press('y', { ctrlKey: true }), false, true)).toBeUndefined();
    });
});
