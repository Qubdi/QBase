import {
    cpSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_URL } from './helpers.js';

// Helpers for tests that run one migration against a database that already
// holds data. Each test gets its own throwaway database, so neither the
// development database nor the shared test database is touched.

/** The real migrations folder. */
export const migrationsDir = fileURLToPath(
    new URL('../src/db/migrations', import.meta.url)
);

export const urlFor = (database: string) =>
    ADMIN_URL.replace(/\/postgres$/, `/${database}`);

/**
 * A copy of the migrations folder holding only the entries `keep` accepts, so a
 * test can stop before a migration (the old shape) or right after it (so a
 * later migration never changes what the test checks).
 */
function folderWith(keep: (index: number, stop: number) => boolean, tag: string) {
    const dir = mkdtempSync(join(tmpdir(), 'qubdidb-migrations-'));
    mkdirSync(join(dir, 'meta'));
    const journal = JSON.parse(
        readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8')
    ) as { entries: { tag: string }[] };
    const stop = journal.entries.findIndex((e) => e.tag === tag);
    if (stop < 1) throw new Error(`no migration named ${tag}`);
    const kept = journal.entries.filter((_, i) => keep(i, stop));
    for (const entry of kept) {
        cpSync(
            join(migrationsDir, `${entry.tag}.sql`),
            join(dir, `${entry.tag}.sql`)
        );
    }
    writeFileSync(
        join(dir, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: kept })
    );
    return dir;
}

/** Every migration before `tag`: the database as it was just before it. */
export const foldersBefore = (tag: string) =>
    folderWith((i, stop) => i < stop, tag);

/** Every migration up to and including `tag`. */
export const foldersThrough = (tag: string) =>
    folderWith((i, stop) => i <= stop, tag);
