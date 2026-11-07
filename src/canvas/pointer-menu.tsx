import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/utils';
import type { Point } from './flow-model';
import type { MenuAction, MenuLine } from './menu-model';

interface Props {
    at: Point;
    lines: MenuLine[];
    onPick(action: MenuAction): void;
    onClose(): void;
}

/** A right-click menu placed at the pointer. A line with a submenu opens it below itself. */
export function PointerMenu({ at, lines, onPick, onClose }: Props) {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState<number>();

    useEffect(() => {
        const away = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) onClose();
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', key);
        };
    }, [onClose]);

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
            style={{ left: at.x, top: at.y }}
            onContextMenu={(event) => event.preventDefault()}
        >
            {draw(lines, false)}
        </div>
    );
}
