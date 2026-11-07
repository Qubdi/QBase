import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pencil } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/platform/ui/tooltip';
import { DiagramIcon } from '@/components/diagram-icon/diagram-icon';
import { useDialog } from '@/hooks/use-dialog';
import { selectLocked } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';

/**
 * The diagram's database icon and name in the top bar. Double-click the name
 * (or the pencil) to rename in place: Enter, the check button or a click
 * outside saves, Escape cancels, a blank name is ignored (spec A5).
 */
export const DiagramName: React.FC = () => {
    const { t } = useTranslation();
    const store = useEditorStoreApi();
    const dialogs = useDialog();
    const name = useEditorStore((s) => s.design.name);
    const type = useEditorStore((s) => s.design.databaseType);
    const locked = useEditorStore(selectLocked);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!editing) return;
        const timer = setTimeout(() => {
            input.current?.focus();
            input.current?.select();
        }, 0);
        return () => clearTimeout(timer);
    }, [editing]);

    const begin = () => {
        if (locked) return;
        setDraft(name);
        setEditing(true);
    };
    const save = () => {
        const next = draft.trim();
        if (next !== '' && next !== name)
            store.getState().edit({ type: 'design.rename', name: next });
        setEditing(false);
    };

    return (
        <div className="flex min-w-0 items-center justify-center gap-2">
            <DiagramIcon
                databaseType={type}
                onClick={() =>
                    dialogs.openOpenDiagramDialog({ canClose: true })
                }
            />
            {editing ? (
                <>
                    <Input
                        ref={input}
                        value={draft}
                        maxLength={200}
                        aria-label={t('editor.workspace.name.label')}
                        className="h-8 w-56"
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={save}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') save();
                            else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditing(false);
                            }
                        }}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={t('editor.workspace.name.confirm')}
                        // the input's blur would save first; this keeps the click from racing it
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={save}
                    >
                        <Check />
                    </Button>
                </>
            ) : (
                <>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span
                                data-testid="diagram-name"
                                className="max-w-[300px] truncate text-sm font-medium"
                                onDoubleClick={begin}
                            >
                                {name}
                            </span>
                        </TooltipTrigger>
                        {locked ? null : (
                            <TooltipContent>
                                {t('editor.workspace.name.hint')}
                            </TooltipContent>
                        )}
                    </Tooltip>
                    {locked ? null : (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 opacity-0 hover:opacity-100 focus-visible:opacity-100"
                            aria-label={t('editor.workspace.name.rename')}
                            onClick={begin}
                        >
                            <Pencil />
                        </Button>
                    )}
                </>
            )}
        </div>
    );
};
