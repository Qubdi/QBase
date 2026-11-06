import type Dexie from 'dexie';
import type { DexieOptions } from 'dexie';
import {
    createLegacyDatabase,
    PREVIOUS_DATABASE_NAME,
    databaseExists,
    deleteDatabase,
} from './database';
import type { QBaseDatabase } from './database';
import { LEGACY_STORES } from './legacy-schema';

export type MergeOutcome = 'none' | 'merged' | 'failed';

/**
 * Moves the rows of the earlier database `QubdiDB` into `QBase` (data-format
 * 2.6): the old database is opened with the same upgrade steps, every row
 * whose key is not yet in `QBase` is added in one transaction (rows already
 * there are never overwritten), and only after that succeeds is `QubdiDB`
 * deleted. On any failure it is left alone to be tried again at the next
 * start, and the editor goes on.
 */
export async function mergePreviousDatabase(
    target: QBaseDatabase,
    options?: DexieOptions,
    warn: (message: string, error: unknown) => void = () => undefined
): Promise<MergeOutcome> {
    let previous: Dexie | undefined;
    try {
        if (!(await databaseExists(PREVIOUS_DATABASE_NAME, options)))
            return 'none';
        previous = createLegacyDatabase(PREVIOUS_DATABASE_NAME, options);
        await previous.open();
        const rows = new Map<string, Record<string, unknown>[]>();
        for (const name of LEGACY_STORES) {
            if (previous.tables.some((t) => t.name === name))
                rows.set(name, await previous.table(name).toArray());
        }
        previous.close();
        previous = undefined;

        const tables = [...rows.keys()].map((name) => target.table(name));
        await target.transaction('rw', tables, async () => {
            for (const [name, list] of rows) {
                const table = target.table(name);
                const keyPath = table.schema.primKey.keyPath as string;
                for (const row of list) {
                    if ((await table.get(row[keyPath] as string)) === undefined)
                        await table.add(row);
                }
            }
        });
        await deleteDatabase(PREVIOUS_DATABASE_NAME, options);
        return 'merged';
    } catch (error) {
        warn(
            'Could not move the earlier database; will try again next start',
            error
        );
        previous?.close();
        return 'failed';
    }
}
