import React, { useEffect, useRef, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { useText } from './use-text';

export interface InlineNameProps {
    value: string;
    onSave: (name: string) => void;
    readOnly?: boolean;
    /** the tooltip on the name; double-clicking edits */
    hint?: string;
    /** what the pencil is called for screen readers */
    editLabel: string;
    className?: string;
    /** a single click on the name, for rows that open on click */
    onActivate?: () => void;
    children?: React.ReactNode;
}

/**
 * A name shown as text that turns into a box on double-click or on the pencil
 * (EDT-096, EDT-190, EDT-206): Enter saves, Escape cancels, leaving the box
 * saves, and an empty or unchanged name is dropped.
 */
export const InlineName: React.FC<InlineNameProps> = ({
    value,
    onSave,
    readOnly,
    hint,
    editLabel,
    className,
    onActivate,
    children,
}) => {
    const text = useText();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const input = useRef<HTMLInputElement>(null);
    const done = useRef(false);

    useEffect(() => {
        if (editing) {
            input.current?.focus();
            input.current?.select();
        }
    }, [editing]);

    const begin = () => {
        if (readOnly) return;
        done.current = false;
        setDraft(value);
        setEditing(true);
    };
    const finish = (save: boolean) => {
        if (done.current) return;
        done.current = true;
        setEditing(false);
        const next = draft.trim();
        if (save && next !== '' && next !== value) onSave(next);
    };

    if (editing)
        return (
            <span className="flex min-w-0 flex-1 items-center gap-1">
                <Input
                    ref={input}
                    aria-label={editLabel}
                    className="h-7 min-w-0 flex-1 px-2 text-sm"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') finish(true);
                        if (e.key === 'Escape') finish(false);
                    }}
                    onBlur={() => finish(true)}
                    onClick={(e) => e.stopPropagation()}
                />
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    aria-label={text('common.saveName')}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                        e.stopPropagation();
                        finish(true);
                    }}
                >
                    <Check />
                </Button>
            </span>
        );

    return (
        <span className="flex min-w-0 flex-1 items-center gap-1">
            <button
                type="button"
                title={readOnly ? undefined : hint}
                className={cn('min-w-0 truncate text-left', className)}
                onClick={onActivate}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    begin();
                }}
            >
                {value}
            </button>
            {children}
            {readOnly ? null : (
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    aria-label={editLabel}
                    onClick={(e) => {
                        e.stopPropagation();
                        begin();
                    }}
                >
                    <Pencil />
                </Button>
            )}
        </span>
    );
};
