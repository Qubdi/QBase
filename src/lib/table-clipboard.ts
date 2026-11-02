import { cloneTable } from './clone';
import type { DBTable } from './domain/db-table';

// Copy and paste for tables (Ctrl/Cmd+C, Ctrl/Cmd+V). Only the tables travel:
// no relationships and no dependencies, so a paste never ties the copy to
// other tables. The clipboard lives for the browser session, which is enough to
// paste into another diagram opened later in the same tab.

let copied: { tables: DBTable[]; pastes: number } | null = null;

const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Remembers copies of these tables. An empty list leaves the clipboard alone. */
export function copyTables(tables: DBTable[]): number {
    if (tables.length === 0) return 0;
    copied = { tables: snapshot(tables), pastes: 0 };
    return tables.length;
}

export const hasCopiedTables = (): boolean => copied !== null;

export function clearCopiedTables() {
    copied = null;
}

export interface PasteOptions {
    /** false for databases without schemas: the schema is dropped */
    keepSchema: boolean;
    /** areas that exist in the diagram being pasted into */
    areaIds?: ReadonlySet<string>;
}

// a table's width when it has not been resized, and the space left between a
// paste and what it was copied from
const DEFAULT_WIDTH = 224;
const GAP = 40;

const slot = (schema: string | null | undefined, name: string) =>
    `${schema ?? ''}|${name.toLowerCase()}`;

/**
 * The tables to add for a paste. Every id is new, names are made unique
 * (`users` becomes `users_copy`, then `users_copy2`), and each paste lands
 * beside the copied tables, one slot further right each time, so copies never
 * overlap the originals or each other.
 */
export function planPaste(
    existing: Pick<DBTable, 'name' | 'schema'>[],
    options: PasteOptions
): DBTable[] {
    if (!copied) return [];
    const step = copied.pastes + 1;
    copied.pastes = step;

    const left = Math.min(...copied.tables.map((t) => t.x));
    const right = Math.max(
        ...copied.tables.map((t) => t.x + (t.width || DEFAULT_WIDTH))
    );
    const shiftX = (right - left + GAP) * step;

    const taken = new Set(existing.map((t) => slot(t.schema, t.name)));

    return copied.tables.map((original) => {
        const table = cloneTable(snapshot(original));
        const schema = options.keepSchema ? table.schema : undefined;

        let name = table.name;
        for (let n = 1; taken.has(slot(schema, name)); n++) {
            name = `${table.name}_copy${n === 1 ? '' : n}`;
        }
        taken.add(slot(schema, name));

        const inThisDiagram =
            table.parentAreaId && options.areaIds?.has(table.parentAreaId);
        return {
            ...table,
            name,
            schema,
            x: table.x + shiftX,
            parentAreaId: inThisDiagram ? table.parentAreaId : null,
        };
    });
}
