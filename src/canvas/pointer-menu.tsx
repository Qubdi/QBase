import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/utils';
import type { Point } from './flow-model';
import { useClampedPlacement } from './use-clamped';
import type { MenuAction, MenuLine } from './menu-model';

interface Props {
    at: Point;
    lines: MenuLine[];
    onPick(action: MenuAction): void;
    onClose(): void;
    /** true while a press outside the menu must not close it (just after a long press) */
    ignoreOutside?(): boolean;
}

/** A right-click menu placed at the pointer. A line with a submenu opens it below itself. */
export function PointerMenu({
    at,
    lines,
    onPick,
    onClose,
    ignoreOutside,
}: Props) {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState<number>();
    const place = useClampedPlacement(ref, at, [lines.length, open]);

    // the keyboard works the menu: focus goes in, arrows move, Escape gives the focus back
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const first = ref.current?.querySelector<HTMLElement>(
            '[role="menuitem"]:not(:disabled)'
        );
        (first ?? ref.current)?.focus();
        return () => {
            if (before && before.isConnected) before.focus();
        };
    }, []);

    const arrows = (event: React.KeyboardEvent) => {
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        const items = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not(:disabled)'
            ) ?? []
        );
        if (items.length === 0) return;
        event.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
                    items.length;
        items[next].focus();
    };

    useEffect(() => {
        const away = (event: MouseEvent) => {
            if (ignoreOutside?.()) return;
            if (!ref.current?.contains(event.target as Node)) onClose();
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) onClose();
        };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', key);
        };
    }, [onClose, ignoreOutside]);

    const draw = (list: MenuLine[], nested: boolean) =>
        list.map((line, i) => {
            if (line.kind === 'separator')
                return (
                    <div
                        key={i}
                        role="separator"
                        className="my-1 h-px bg-border"
                    />
                );
            const text =
                line.verbatim ??
                t(`canvas.menu.${line.label}`, line.values ?? {});
            const submenu = line.submenu;
            return (
                <div key={i}>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={line.disabled}
                        aria-haspopup={submenu ? 'menu' : undefined}
                        aria-expanded={
                            submenu && !nested ? open === i : undefined
                        }
                        className={cn(
                            'flex w-full items-center rounded px-2 py-1 text-left text-sm hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent',
                            nested && 'pl-5'
                        )}
                        onClick={() => {
                            if (submenu) setOpen(open === i ? undefined : i);
                            else if (line.action) {
                                onPick(line.action);
                                onClose();
                            }
                        }}
                    >
                        {text}
                    </button>
                    {submenu && open === i && !nested ? (
                        <div role="menu">{draw(submenu, true)}</div>
                    ) : null}
                </div>
            );
        });

    return (
        <div
            ref={ref}
            role="menu"
            data-testid="pointer-menu"
            tabIndex={-1}
            className="fixed z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{
                left: place.left,
                top: place.top,
                maxWidth: 'calc(100vw - 16px)',
            }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={arrows}
        >
            {draw(lines, false)}
        </div>
    );
}
