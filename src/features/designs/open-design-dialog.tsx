import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { localeTag } from '@/i18n/locale-tag';
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/platform/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/platform/ui/table';
import { Spinner } from '@/platform/ui/spinner';
import { toast } from '@/platform/toast/use-toast';
import { DiagramIcon } from '@/components/diagram-icon/diagram-icon';
import { SearchInput } from '@/components/qubdi/search-input';
import type {
    StorageAdapter,
    DiagramSummary,
} from '@/persistence/storage-adapter';
import type { EditorStore } from '@/store/editor-store';
import { diagnosticText } from '@/lib/diagnostic-text';
import { cn } from '@/lib/utils/utils';
import { ConfirmDialog } from './confirm-dialog';
import {
    duplicateDesign,
    rememberDefault,
    removeStoredDesign,
    renameStoredDesign,
} from './design-service';
import { matchesSearch } from './design-search';
import { RenameDesignDialog } from './rename-design-dialog';
import { useDesignList } from './use-design-list';

/** The search box shows when more diagrams than this are stored (the old editor had no search). */
const SEARCH_FROM = 1;

export interface OpenDesignDialogProps {
    open: boolean;
    adapter: StorageAdapter;
    /** the store of the open editor, when there is one */
    store: EditorStore | null;
    /** false when nothing is open behind the dialog */
    canClose: boolean;
    onClose: () => void;
    onCreate: () => void;
}

/** The local Open dialog: search, select, open, rename, duplicate, delete. */
export const OpenDesignDialog: React.FC<OpenDesignDialogProps> = ({
    open,
    adapter,
    store,
    canClose,
    onClose,
    onCreate,
}) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { items, reload } = useDesignList(adapter, open);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string | undefined>();
    const [renaming, setRenaming] = useState<
        { id: string; name: string } | undefined
    >();
    const [deleting, setDeleting] = useState<DiagramSummary | undefined>();
    const rows = useRef(new Map<string, HTMLTableRowElement>());

    useEffect(() => {
        if (open) {
            setSearch('');
            setSelected(undefined);
        }
    }, [open]);

    const shown = useMemo(
        () => (items ?? []).filter((d) => matchesSearch(d, search)),
        [items, search]
    );
    const format = (ms: number) =>
        new Date(ms).toLocaleString(localeTag(i18n.language));

    const openDesign = async (id: string) => {
        await rememberDefault(adapter, id);
        onClose();
        navigate(`/diagrams/${id}`);
    };

    const rename = async (id: string, name: string) => {
        // the open diagram changes through the store so its autosave does not undo the rename
        if (store && store.getState().design.id === id) {
            const result = store
                .getState()
                .edit({ type: 'design.rename', name });
            // a locked diagram refuses the edit: say so, the name did not change
            if (!result.ok)
                toast({
                    title: diagnosticText(result.message),
                    variant: 'destructive',
                });
        } else await renameStoredDesign(adapter, id, name);
        await reload();
    };

    const duplicate = async (id: string) => {
        const copy = await duplicateDesign(
            adapter,
            id,
            t('editor.designs.open.copySuffix')
        );
        if (copy)
            toast({
                title: t('editor.designs.open.duplicated', { name: copy.name }),
            });
        await reload();
    };

    const remove = async (item: DiagramSummary) => {
        const isOpen = !!store && store.getState().design.id === item.id;
        // stops the autosave from writing the diagram back
        if (isOpen) store?.getState().setReadonly(true);
        try {
            const left = await removeStoredDesign(adapter, item.id);
            setDeleting(undefined);
            if (isOpen || left === 0) window.location.assign('/');
            else await reload();
        } catch {
            if (isOpen) store?.getState().setReadonly(false);
            setDeleting(undefined);
            toast({
                title: t('editor.designs.delete.failed'),
                variant: 'destructive',
            });
        }
    };

    const move = (from: number, step: number) => {
        const next = shown[from + step];
        if (!next) return;
        rows.current.get(next.id)?.focus();
        setSelected(next.id);
    };

    return (
        <>
            <Dialog
                open={open && !renaming && !deleting}
                onOpenChange={(next) => !next && canClose && onClose()}
            >
                <DialogContent
                    className="max-w-[704px]"
                    showClose={canClose}
                    onEscapeKeyDown={(e) => !canClose && e.preventDefault()}
                    onInteractOutside={(e) => !canClose && e.preventDefault()}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {t('editor.designs.open.title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('editor.designs.open.description')}
                        </DialogDescription>
                    </DialogHeader>
                    {/* one diagram needs no search box; it appears with the second */}
                    {(items?.length ?? 0) > SEARCH_FROM ? (
                        <SearchInput
                            value={search}
                            onChange={setSearch}
                            placeholder={t('editor.designs.open.search')}
                        />
                    ) : null}
                    <div className="h-[316px] overflow-auto">
                        {items === undefined ? (
                            <div className="flex h-48 items-center justify-center">
                                <Spinner />
                            </div>
                        ) : shown.length === 0 ? (
                            <p className="p-6 text-center text-sm text-muted-foreground">
                                {search
                                    ? t('editor.designs.open.noMatch')
                                    : t('editor.designs.open.empty')}
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead colSpan={2}>
                                            {t(
                                                'editor.designs.open.columns.name'
                                            )}
                                        </TableHead>
                                        <TableHead className="hidden md:table-cell">
                                            {t(
                                                'editor.designs.open.columns.created'
                                            )}
                                        </TableHead>
                                        <TableHead>
                                            {t(
                                                'editor.designs.open.columns.changed'
                                            )}
                                        </TableHead>
                                        <TableHead className="text-right">
                                            {t(
                                                'editor.designs.open.columns.tables'
                                            )}
                                        </TableHead>
                                        <TableHead className="w-10">
                                            <span className="sr-only">
                                                {t(
                                                    'editor.designs.open.columns.actions'
                                                )}
                                            </span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {shown.map((d, i) => (
                                        <TableRow
                                            key={d.id}
                                            ref={(el) => {
                                                if (el)
                                                    rows.current.set(d.id, el);
                                                else rows.current.delete(d.id);
                                            }}
                                            tabIndex={0}
                                            aria-selected={selected === d.id}
                                            data-state={
                                                selected === d.id
                                                    ? 'selected'
                                                    : undefined
                                            }
                                            className={cn(
                                                'cursor-pointer',
                                                selected === d.id && 'bg-accent'
                                            )}
                                            onClick={() => setSelected(d.id)}
                                            onDoubleClick={() =>
                                                void openDesign(d.id)
                                            }
                                            onKeyDown={(e) => {
                                                if (
                                                    e.target !== e.currentTarget
                                                )
                                                    return;
                                                if (
                                                    e.key === 'Enter' ||
                                                    e.key === ' '
                                                ) {
                                                    e.preventDefault();
                                                    void openDesign(d.id);
                                                } else if (
                                                    e.key === 'ArrowDown'
                                                ) {
                                                    e.preventDefault();
                                                    move(i, 1);
                                                } else if (
                                                    e.key === 'ArrowUp'
                                                ) {
                                                    e.preventDefault();
                                                    move(i, -1);
                                                }
                                            }}
                                        >
                                            <TableCell>
                                                <DiagramIcon
                                                    databaseType={
                                                        d.databaseType
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell className="max-w-64 truncate font-medium">
                                                {d.name}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                {format(d.createdAt)}
                                            </TableCell>
                                            <TableCell>
                                                {format(d.updatedAt)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {d.tableCount}
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        asChild
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="size-8"
                                                            aria-label={t(
                                                                'editor.designs.open.actionsFor',
                                                                { name: d.name }
                                                            )}
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
                                                            <MoreHorizontal />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        align="end"
                                                        onClick={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                    >
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                void openDesign(
                                                                    d.id
                                                                )
                                                            }
                                                        >
                                                            {t(
                                                                'editor.designs.open.rowOpen'
                                                            )}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                setRenaming({
                                                                    id: d.id,
                                                                    name: d.name,
                                                                })
                                                            }
                                                        >
                                                            <Pencil />{' '}
                                                            {t(
                                                                'editor.designs.open.rowRename'
                                                            )}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                void duplicate(
                                                                    d.id
                                                                )
                                                            }
                                                        >
                                                            <Copy />{' '}
                                                            {t(
                                                                'editor.designs.open.rowDuplicate'
                                                            )}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onSelect={() =>
                                                                setDeleting(d)
                                                            }
                                                        >
                                                            <Trash2 />{' '}
                                                            {t(
                                                                'editor.designs.open.rowDelete'
                                                            )}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
                        {canClose ? (
                            <Button variant="secondary" onClick={onClose}>
                                {t('editor.common.cancel')}
                            </Button>
                        ) : (
                            <span />
                        )}
                        <div className="flex gap-2 max-sm:flex-col-reverse">
                            <Button variant="secondary" onClick={onCreate}>
                                {t('editor.designs.open.newDatabase')}
                            </Button>
                            <Button
                                disabled={!selected}
                                onClick={() =>
                                    selected && void openDesign(selected)
                                }
                            >
                                {t('editor.designs.open.open')}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <RenameDesignDialog
                target={renaming}
                onRename={rename}
                onClose={() => setRenaming(undefined)}
            />
            <ConfirmDialog
                open={!!deleting}
                title={t('editor.designs.delete.title')}
                description={t('editor.designs.delete.description', {
                    name: deleting?.name ?? '',
                })}
                confirmLabel={t('editor.designs.delete.confirm')}
                cancelLabel={t('editor.common.cancel')}
                destructive
                onConfirm={() => deleting && remove(deleting)}
                onCancel={() => setDeleting(undefined)}
            />
        </>
    );
};
