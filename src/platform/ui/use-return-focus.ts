import { useCallback, useRef } from 'react';

/** The control to give focus back to: the one focused when the dialog was built. */
const opener = (): HTMLElement | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body)
        return null;
    // an item of a menu that is about to close: its trigger is the control to return to
    const menu = active.closest('[role="menu"]');
    if (menu?.id) {
        const trigger = document.querySelector<HTMLElement>(
            `[aria-controls="${CSS.escape(menu.id)}"]`
        );
        if (trigger) return trigger;
    }
    return active;
};

/**
 * Dialogs here are opened by state (a menu item, a shortcut), not by a Radix
 * trigger, so Radix has nothing to return focus to. This remembers the
 * control focused just before the dialog takes focus and puts focus back on
 * it when the dialog closes. Spread the result on the dialog content.
 */
export const useReturnFocus = (handlers: {
    onOpenAutoFocus?: (event: Event) => void;
    onCloseAutoFocus?: (event: Event) => void;
}) => {
    const from = useRef<HTMLElement | null>(null);
    const { onOpenAutoFocus, onCloseAutoFocus } = handlers;
    return {
        onOpenAutoFocus: useCallback(
            (event: Event) => {
                from.current = opener();
                onOpenAutoFocus?.(event);
            },
            [onOpenAutoFocus]
        ),
        onCloseAutoFocus: useCallback(
            (event: Event) => {
                onCloseAutoFocus?.(event);
                if (event.defaultPrevented) return;
                const target = from.current;
                from.current = null;
                if (target?.isConnected) {
                    event.preventDefault();
                    target.focus();
                }
            },
            [onCloseAutoFocus]
        ),
    };
};
