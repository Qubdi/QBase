import { useCallback } from 'react';
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
}

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
}: TableClipboardOptions) {
    const mod = getOperatingSystem() === 'mac' ? 'meta' : 'ctrl';

    const copy = useCallback(() => {
        // leave ordinary text copying alone
        if (window.getSelection()?.toString()) return;
        const count = copyTables(
            tables.filter((t) => selectedIds.includes(t.id))
        );
        if (count > 0) {
            notify?.(
                count === 1 ? 'Table copied' : `${count} tables copied`,
                'Press Ctrl+V to paste it.'
            );
        }
    }, [tables, selectedIds, notify]);

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
            notify?.(
                planned.length === 1
                    ? 'Table pasted'
                    : `${planned.length} tables pasted`
            );
        }
    }, [readonly, tables, areaIds, databaseType, createTable, notify]);

    useHotkeys(`${mod}+c`, copy, { preventDefault: false }, [copy]);
    useHotkeys(`${mod}+v`, () => void paste(), { preventDefault: false }, [
        paste,
    ]);

    return { copy, paste };
}
