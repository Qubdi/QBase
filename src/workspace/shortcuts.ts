/**
 * The keyboard shortcuts of the editor, as data (architecture section 7).
 * `Mod` is Cmd on a Mac and Ctrl elsewhere. The workspace answers the shortcuts
 * whose `owner` is 'workspace'; the others are listed so the reference and the
 * tooltips stay in one place, and each is answered in one place only: the canvas
 * listens for Mod+0, Mod+C, Mod+V and Delete itself, so no other code binds them.
 */
export type ShortcutId =
    | 'undo'
    | 'redo'
    | 'openDiagram'
    | 'save'
    | 'togglePanel'
    | 'fitAll'
    | 'toggleTheme'
    | 'toggleFilter'
    | 'copyTables'
    | 'pasteTables'
    | 'removeSelection';

export interface Shortcut {
    id: ShortcutId;
    /** the value of `KeyboardEvent.key`, lower case */
    key: string;
    /** needs Cmd (Mac) or Ctrl (elsewhere) */
    mod: boolean;
    /** true: Shift must be held; false: it must not be; undefined: either */
    shift?: boolean;
    /** still answered while a text box has focus */
    inTextBox: boolean;
    /** the browser's own action is cancelled when the shortcut fires */
    cancelsBrowser: boolean;
    owner: 'workspace' | 'canvas';
}

export const SHORTCUTS: readonly Shortcut[] = [
    {
        id: 'undo',
        key: 'z',
        mod: true,
        shift: false,
        inTextBox: false,
        cancelsBrowser: true,
        owner: 'workspace',
    },
    {
        id: 'redo',
        key: 'z',
        mod: true,
        shift: true,
        inTextBox: false,
        cancelsBrowser: true,
        owner: 'workspace',
    },
    {
        id: 'openDiagram',
        key: 'o',
        mod: true,
        inTextBox: false,
        cancelsBrowser: true,
        owner: 'workspace',
    },
    {
        id: 'save',
        key: 's',
        mod: true,
        inTextBox: false,
        cancelsBrowser: true,
        owner: 'workspace',
    },
    {
        id: 'togglePanel',
        key: 'b',
        mod: true,
        inTextBox: false,
        cancelsBrowser: true,
        owner: 'workspace',
    },
    {
        id: 'fitAll',
        key: '0',
        mod: true,
        inTextBox: false,
        cancelsBrowser: true,
        owner: 'canvas',
    },
    {
        id: 'toggleTheme',
        key: 'm',
        mod: true,
        inTextBox: true,
        cancelsBrowser: true,
        owner: 'workspace',
    },
    {
        id: 'toggleFilter',
        key: 'f',
        mod: true,
        inTextBox: true,
        cancelsBrowser: true,
        owner: 'workspace',
    },
    {
        id: 'copyTables',
        key: 'c',
        mod: true,
        inTextBox: false,
        cancelsBrowser: false,
        owner: 'canvas',
    },
    {
        id: 'pasteTables',
        key: 'v',
        mod: true,
        inTextBox: false,
        cancelsBrowser: false,
        owner: 'canvas',
    },
    {
        id: 'removeSelection',
        key: 'delete',
        mod: false,
        inTextBox: false,
        cancelsBrowser: false,
        owner: 'canvas',
    },
];

/** The part of a keyboard event the matcher reads. */
export interface KeyInput {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
}

/**
 * The shortcut a key press stands for, or undefined. `mac` decides which
 * modifier counts as Mod; the other one must be up, so Ctrl+Z on a Mac stays
 * the browser's.
 */
export function matchShortcut(
    input: KeyInput,
    options: { mac: boolean; inTextBox: boolean }
): Shortcut | undefined {
    const mod = options.mac ? input.metaKey : input.ctrlKey;
    const stray = options.mac ? input.ctrlKey : input.metaKey;
    if (stray || input.altKey) return undefined;
    const key = input.key.toLowerCase();
    // Windows and Linux people also redo with Ctrl+Y (not listed: one entry per command)
    if (!options.mac && mod && key === 'y' && !input.shiftKey)
        return options.inTextBox ? undefined : shortcutById('redo');
    return SHORTCUTS.find((s) => {
        if (s.key !== key || s.mod !== mod) return false;
        if (s.shift !== undefined && s.shift !== input.shiftKey) return false;
        // Shift+Z types a capital: the key still matches because of toLowerCase
        if (options.inTextBox && !s.inTextBox) return false;
        return true;
    });
}

/** True when the element takes typed text (so the keys are the box's own). */
export function isTextBox(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    const type = (target as HTMLInputElement).type;
    return ![
        'button',
        'checkbox',
        'radio',
        'submit',
        'reset',
        'range',
        'file',
        'color',
    ].includes(type);
}

const KEY_LABELS: Record<string, string> = { delete: 'Del' };

/** The text shown beside a menu item, for example `Ctrl+Shift+Z` or the Mac symbols. */
export function shortcutLabel(shortcut: Shortcut, mac: boolean): string {
    const parts: string[] = [];
    if (shortcut.mod) parts.push(mac ? '⌘' : 'Ctrl');
    if (shortcut.shift) parts.push(mac ? '⇧' : 'Shift');
    parts.push(KEY_LABELS[shortcut.key] ?? shortcut.key.toUpperCase());
    return mac ? parts.join('') : parts.join('+');
}

export const shortcutById = (id: ShortcutId): Shortcut =>
    SHORTCUTS.find((s) => s.id === id) as Shortcut;
