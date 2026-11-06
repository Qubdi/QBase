import { useCallback, useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
    databasesWithSchemas,
    type DBTable,
    type DatabaseType,
} from '@/qbase/diagram-types';
import { copyTables, hasCopiedTables, planPaste } from '@/lib/table-clipboard';
import { getOperatingSystem } from '@/lib/utils';

export interface TableClipboardOptions {
    tables: DBTable[];
    /** ids of everything selected on the canvas (tables, notes, areas) */
    selectedIds: string[];
    areaIds: string[];
    databaseType: DatabaseType;
    readonly?: boolean;
    createTable: (table: DBTable) => Promise<unknown>;
    notify?: (title: string, description?: string) => void;
    /** the words of the notices; English when not given */
    text?: Partial<ClipboardText>;
}

export interface ClipboardText {
    copied: (count: number) => string;
    pasteHint: (key: string) => string;
    pasted: (count: number) => string;
}

const ENGLISH: ClipboardText = {
    copied: (n) => (n === 1 ? 'Table copied' : `${n} tables copied`),
    pasteHint: (key) => `Press ${key} to paste it.`,
    pasted: (n) => (n === 1 ? 'Table pasted' : `${n} tables pasted`),
};

/**
 * Ctrl/Cmd+C and Ctrl/Cmd+V for the selected tables, like Delete works. Only
 * tables are copied, never relationships, so a copy is not tied to other
 * tables. Typing in a text box keeps the browser's own copy and paste.
 */
export function useTableClipboard({
    tables,
    selectedIds,
    areaIds,
    databaseType,
    readonly,
    createTable,
    notify,
    text,
}: TableClipboardOptions) {
    const onMac = getOperatingSystem() === 'mac';
    const mod = onMac ? 'meta' : 'ctrl';
    const words = useMemo(() => ({ ...ENGLISH, ...text }), [text]);

    const copy = useCallback(() => {
        // leave ordinary text copying alone
        if (window.getSelection()?.toString()) return;
        const count = copyTables(
            tables.filter((t) => selectedIds.includes(t.id))
        );
        if (count > 0) {
            // EDT-228: name the key of this platform
            notify?.(
                words.copied(count),
                words.pasteHint(onMac ? 'Cmd+V' : 'Ctrl+V')
            );
        }
    }, [tables, selectedIds, notify, words, onMac]);

    const paste = useCallback(async () => {
        if (readonly || !hasCopiedTables()) return;
        const planned = planPaste(tables, {
            keepSchema: databasesWithSchemas.includes(databaseType),
            areaIds: new Set(areaIds),
        });
        for (const table of planned) {
            await createTable(table);
        }
        if (planned.length > 0) {
            notify?.(words.pasted(planned.length));
        }
    }, [readonly, tables, areaIds, databaseType, createTable, notify, words]);

    useHotkeys(`${mod}+c`, copy, { preventDefault: false }, [copy]);
    useHotkeys(`${mod}+v`, () => void paste(), { preventDefault: false }, [
        paste,
    ]);

    return { copy, paste };
}
