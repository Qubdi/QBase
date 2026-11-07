/** True when the key press happens in a place where the person is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function isMacPlatform(): boolean {
    return (
        typeof navigator !== 'undefined' &&
        /Mac|iPhone|iPad/i.test(navigator.platform ?? '')
    );
}

/** Ctrl on Windows and Linux, Cmd on a Mac (the spec's "Mod"). */
export function hasMod(event: KeyboardEvent): boolean {
    return isMacPlatform() ? event.metaKey : event.ctrlKey;
}

/**
 * A shortcut as it is written on this platform (EDT-271): `shortcutLabel(['Mod',
 * 'Shift', 'Z'])` reads Ctrl+Shift+Z, or the command and shift symbols on a Mac.
 */
export function shortcutLabel(keys: readonly string[], mac = isMacPlatform()) {
    const word = (key: string) =>
        mac
            ? ({ Mod: '⌘', Shift: '⇧', Alt: '⌥' }[key] ?? key)
            : key === 'Mod'
              ? 'Ctrl'
              : key;
    return keys.map(word).join(mac ? '' : '+');
}
