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

/** Parts of the page that float above the canvas and own their own keys. */
const OVERLAY =
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';

/** A modal dialog or a menu is open somewhere in the page. */
export function overlayOpen(): boolean {
    return (
        document.querySelector(
            '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"], [role="listbox"]'
        ) !== null
    );
}

/** The key press comes from inside a dialog, menu, select list or popover. */
export function insideOverlay(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(OVERLAY) !== null;
}

/** A button, link or the like has the focus: Delete and paste are not for the canvas then. */
export function isPressable(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return (
        target.closest(
            'button, a[href], summary, [role="button"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"], [role="option"]'
        ) !== null
    );
}

/**
 * Whether a canvas shortcut that changes the design (Delete, Backspace, paste)
 * may run: nothing is typed into, no dialog or menu is open and the focus is
 * not on a control that belongs to someone else.
 */
export function canvasKeysAllowed(event: KeyboardEvent): boolean {
    return !(
        isTypingTarget(event.target) ||
        overlayOpen() ||
        insideOverlay(event.target) ||
        isPressable(event.target)
    );
}

/** Open lists and popovers that take Escape for themselves. */
const ESCAPE_OWNERS =
    '[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]';

/**
 * Whether an Escape press still needs to be acted on: a popover, select or
 * dialog that took it has marked the event as handled, or it came from inside one.
 */
export function escapeIsFree(event: KeyboardEvent): boolean {
    if (event.defaultPrevented) return false;
    return !(
        event.target instanceof Element && event.target.closest(ESCAPE_OWNERS)
    );
}
