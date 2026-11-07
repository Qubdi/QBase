import type { Table } from 'dexie';
import { parse } from '../core/wire/parse';
import { serialise } from '../core/wire/serialise';
import type { WireWarning } from '../core/wire/warning';
import { assembleLegacyDiagram } from './assemble-legacy';
import type { LegacyRows } from './assemble-legacy';
import type { QBaseDatabase } from './database';
import { summaryOf } from './storage-adapter';

export const MIGRATION_MARKER = 'legacy-layout-migrated';

export interface MigrationReport {
    /** false when the marker said it was done already */
    ran: boolean;
    /** diagrams written to the new layout */
    migrated: string[];
    /** diagrams that were already there and were not overwritten */
    skipped: string[];
    /** repairs made while reading, by diagram id */
    warnings: Record<string, WireWarning[]>;
}

/**
 * Reads every diagram of the old nine-store layout, builds its serialised
 * design and writes it to the new stores, then sets a marker. The old stores
 * stay in place for one release. A design that already exists in the new
 * layout is never overwritten. Runs in one transaction: either all of it
 * lands or none.
 */
export async function migrateLegacyLayout(
    db: QBaseDatabase,
    now: number = Date.now()
): Promise<MigrationReport> {
    const report: MigrationReport = {
        ran: false,
        migrated: [],
        skipped: [],
        warnings: {},
    };
    await db.transaction(
        'rw',
        [
            db.meta,
            db.designs,
            db.design_index,
            db.diagrams,
            db.db_tables,
            db.db_relationships,
            db.db_dependencies,
            db.areas,
            db.db_custom_types,
            db.notes,
        ],
        async () => {
            if (await db.meta.get(MIGRATION_MARKER)) return;
            report.ran = true;
            const diagrams = await db.diagrams.toArray();
            for (const row of diagrams) {
                const id = String(row.id);
                if (await db.designs.get(id)) {
                    report.skipped.push(id);
                    continue;
                }
                const children = (
                    table: Table<Record<string, unknown>, string>
                ) =>
                    // children carry the key as it was stored (a very old
                    // auto-increment row has a number, not text)
                    table
                        .where('diagramId')
                        .equals(row.id as string)
                        .toArray();
                const rows: LegacyRows = {
                    diagram: { ...row, id },
                    tables: await children(db.db_tables),
                    relationships: await children(db.db_relationships),
                    dependencies: await children(db.db_dependencies),
                    areas: await children(db.areas),
                    customTypes: await children(db.db_custom_types),
                    notes: await children(db.notes),
                };
                const { design, warnings } = parse(
                    assembleLegacyDiagram(rows),
                    { now }
                );
                await db.designs.put({ id: design.id, doc: serialise(design) });
                await db.design_index.put(summaryOf(design));
                report.migrated.push(id);
                if (warnings.length > 0) report.warnings[id] = warnings;
            }
            await db.meta.put({
                key: MIGRATION_MARKER,
                value: new Date(now).toISOString(),
            });
        }
    );
    return report;
}
