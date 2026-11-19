/**
 * Export and import cases that cross formats: a diagram written out and read
 * back (JSON file, SQL, DBML) keeps its tables, columns and links, and input
 * that is not a diagram is refused with a message instead of a crash.
 */
import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import type { Design } from '@/core/model/design';
import { exportFileText } from '@/core/wire/file-export';
import { ImportError, importFileText } from '@/core/wire/file-import';
import {
    sampleS1,
    sampleS2,
    sampleS3,
} from '@/dialects/testing/sample-designs';
import { exportDbml } from './dbml/export-dbml';
import { importDbml, MAX_DBML_CHARS } from './dbml/import-dbml';
import { exportSql } from './sql/export-sql';
import { importSql } from './sql/import-sql';

type Dialect = 'postgresql' | 'mysql' | 'sql_server' | 'sqlite';
const DIALECTS: Dialect[] = ['postgresql', 'mysql', 'sql_server', 'sqlite'];
const SAMPLES = { S1: sampleS1, S2: sampleS2, S3: sampleS3 } as const;
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

/** What must survive a round trip: names, column facts and which columns link. */
const shape = (d: Design) => ({
    tables: listOf(d.entities)
        // SQLite keeps its own counter table; a script never carries it
        .filter((e) => e.kind === 'table' && e.name !== 'sqlite_sequence')
        .map((e) => ({
            name: e.name,
            columns: e.columnIds.map((id) => {
                const c = d.columns[id];
                return [c.name, c.nullable, c.primaryKey];
            }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    links: listOf(d.links)
        .map((l) => {
            const s = d.entities.byId[l.sourceEntityId];
            const t = d.entities.byId[l.targetEntityId];
            return `${s.name}.${d.columns[l.sourceColumnId].name}>${t.name}.${d.columns[l.targetColumnId].name}`;
        })
        .sort(),
});

const errors = <T extends { severity: string }>(diagnostics: T[]): T[] =>
    diagnostics.filter((d) => d.severity === 'error');

describe('JSON file: export, then import', () => {
    for (const [label, sample] of Object.entries(SAMPLES))
        for (const dialect of DIALECTS)
            it(`${label} ${dialect}: tables, columns and links come back`, () => {
                const design = sample(dialect);
                const back = importFileText(exportFileText(design), {
                    now: NOW,
                });
                expect(back.design.databaseType).toBe(dialect);
                expect(back.design.name).toBe(design.name);
                expect(shape(back.design)).toEqual(shape(design));
            });

    it('is stable: a second export of the imported diagram reads back the same', () => {
        const once = importFileText(exportFileText(sampleS2('postgresql')), {
            now: NOW,
        }).design;
        const twice = importFileText(exportFileText(once), {
            now: NOW,
        }).design;
        expect(shape(twice)).toEqual(shape(once));
    });

    it('gives the imported diagram its own ids, so it can sit beside the original', () => {
        const design = sampleS1('postgresql');
        const back = importFileText(exportFileText(design), { now: NOW });
        expect(back.design.id).not.toBe(design.id);
        const old = new Set(Object.keys(design.columns));
        expect(Object.keys(back.design.columns).some((id) => old.has(id))).toBe(
            false
        );
    });
});

describe('JSON file: input that is not a diagram', () => {
    const refused = (text: string) => {
        try {
            importFileText(text, { now: NOW });
        } catch (err) {
            expect(err).toBeInstanceOf(ImportError);
            expect((err as Error).message).not.toBe('');
            return err as ImportError;
        }
        throw new Error('the file was accepted');
    };

    it.each([
        ['an empty file', ''],
        ['text that is not JSON', 'CREATE TABLE a (id int);'],
        ['truncated JSON', '{"tables": ['],
        ['an array', '[]'],
        ['null', 'null'],
        ['a bare string', '"hello"'],
        ['an empty object', '{}'],
        ['tables that are not a list', '{"tables": "x"}'],
    ])('refuses %s', (_name, text) => {
        refused(text);
    });

    it('says the file is not valid JSON for broken text', () => {
        expect(refused('{').message).toMatch(/not valid JSON/);
    });

    it('lists what is wrong when the JSON is not a diagram', () => {
        expect(refused('{}').problems.length).toBeGreaterThan(0);
    });

    it('drops keys it does not know instead of keeping them', () => {
        const json = JSON.parse(exportFileText(sampleS1('postgresql')));
        json.somethingElse = { evil: true };
        json.tables[0].alsoUnknown = 1;
        const back = importFileText(JSON.stringify(json), { now: NOW });
        expect(JSON.stringify(back.design)).not.toContain('somethingElse');
        expect(JSON.stringify(back.design)).not.toContain('alsoUnknown');
    });

    it('leaves out a link whose table is missing, and reports it', () => {
        const json = JSON.parse(exportFileText(sampleS1('postgresql')));
        expect(json.relationships.length).toBeGreaterThan(0);
        json.relationships[0].targetTableId = 'no-such-table';
        const back = importFileText(JSON.stringify(json), { now: NOW });
        expect(listOf(back.design.links)).toHaveLength(
            json.relationships.length - 1
        );
        expect(back.warnings.length).toBeGreaterThan(0);
    });

    it('does not let __proto__ in the file reach the diagram', () => {
        const text = exportFileText(sampleS1('postgresql')).replace(
            /^\{/,
            '{"__proto__": {"polluted": true},'
        );
        let result;
        try {
            result = importFileText(text, { now: NOW });
        } catch (err) {
            expect(err).toBeInstanceOf(ImportError);
        }
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        if (result)
            expect(
                (result.design as unknown as Record<string, unknown>).polluted
            ).toBeUndefined();
    });
});

describe('SQL: export, then import', () => {
    for (const [label, sample] of Object.entries(SAMPLES))
        for (const dialect of DIALECTS)
            it(`${label} ${dialect}: the script reads back with the same tables and links`, () => {
                const design = sample(dialect);
                const out = exportSql(design, dialect);
                expect(errors(out.diagnostics)).toEqual([]);
                expect(out.text).not.toBe('');
                const back = importSql(out.text, dialect, { now: NOW });
                expect(errors(back.diagnostics)).toEqual([]);
                expect(back.design).toBeDefined();
                const want = shape(design);
                const got = shape(back.design!);
                expect(got.tables.map((t) => t.name)).toEqual(
                    want.tables.map((t) => t.name)
                );
                expect(got.links).toEqual(want.links);
            });

    it('exports to another database and the script imports there', () => {
        const design = sampleS1('postgresql');
        for (const target of ['mysql', 'sql_server', 'sqlite'] as const) {
            const out = exportSql(design, target);
            expect(errors(out.diagnostics), target).toEqual([]);
            const back = importSql(out.text, target, { now: NOW });
            expect(errors(back.diagnostics), target).toEqual([]);
            expect(back.counts.tables, target).toBe(2);
            expect(back.counts.relationships, target).toBe(1);
        }
    });

    it('exports nothing for a diagram with no tables, and says why', () => {
        const empty: Design = {
            ...sampleS1('postgresql'),
            entities: { order: [], byId: {} },
            links: { order: [], byId: {} },
        };
        const out = exportSql(empty, 'postgresql');
        expect(out.text).toBe('');
        expect(out.diagnostics.length).toBeGreaterThan(0);
    });
});

describe('SQL import: input that is not a script', () => {
    it.each(DIALECTS)('%s: empty text is refused with a message', (d) => {
        const r = importSql('', d, { now: NOW });
        expect(r.design).toBeUndefined();
        expect(errors(r.diagnostics).map((x) => x.message)).toEqual([
            'SQL script is empty',
        ]);
    });

    it('a comment-only script imports nothing', () => {
        const r = importSql('-- just a note\n/* and another */', 'postgresql');
        expect(r.design).toBeUndefined();
        expect(r.counts.tables).toBe(0);
    });

    it('broken SQL gives a diagnostic and no design, not a thrown error', () => {
        const r = importSql('CREATE TABLE (id int', 'postgresql', {
            now: NOW,
        });
        expect(r.design).toBeUndefined();
        expect(r.diagnostics.length).toBeGreaterThan(0);
    });

    it('statements that are not CREATE TABLE do not become tables', () => {
        const r = importSql(
            "INSERT INTO a VALUES (1); DROP TABLE a; SELECT 'x';",
            'postgresql'
        );
        expect(r.counts.tables).toBe(0);
    });

    it('a foreign key to a table that is not in the script is dropped with a warning', () => {
        const r = importSql(
            'CREATE TABLE b (id int PRIMARY KEY, a_id int REFERENCES a(id));',
            'postgresql',
            { now: NOW }
        );
        expect(r.counts.tables).toBe(1);
        expect(r.counts.relationships).toBe(0);
        expect(r.diagnostics.some((x) => x.severity === 'warning')).toBe(true);
    });

    it('keeps a quoted table name that holds a space and a semicolon', () => {
        const r = importSql(
            'CREATE TABLE "my; table" ("a b" int NOT NULL);',
            'postgresql',
            { now: NOW }
        );
        expect(r.design).toBeDefined();
        const [t] = listOf(r.design!.entities);
        expect(t.name).toBe('my; table');
        expect(r.design!.columns[t.columnIds[0]].name).toBe('a b');
    });
});

describe('DBML: export, then import', () => {
    for (const [label, sample] of Object.entries(SAMPLES))
        for (const dialect of ['postgresql', 'mysql'] as const)
            it(`${label} ${dialect}: tables and links come back`, () => {
                const design = sample(dialect);
                const out = exportDbml(design);
                expect(errors(out.diagnostics)).toEqual([]);
                const back = importDbml(out.text, dialect, { now: NOW });
                expect(errors(back.diagnostics)).toEqual([]);
                expect(back.design).toBeDefined();
                const want = shape(design);
                const got = shape(back.design!);
                expect(got.tables.map((t) => t.name)).toEqual(
                    want.tables.map((t) => t.name)
                );
                expect(got.links).toEqual(want.links);
            });
});

describe('DBML import: input that is not DBML', () => {
    it('refuses text over the size limit before parsing it', () => {
        const r = importDbml('a'.repeat(MAX_DBML_CHARS + 1), 'postgresql');
        expect(r.design).toBeUndefined();
        expect(errors(r.diagnostics)).toHaveLength(1);
        expect(r.diagnostics[0].message).toMatch(/too large/);
    });

    it('accepts text exactly at the limit without calling it too large', () => {
        const r = importDbml(' '.repeat(MAX_DBML_CHARS), 'postgresql');
        expect(r.diagnostics.map((d) => d.message).join()).not.toMatch(
            /too large/
        );
    });

    it('broken DBML gives an error with a line, and no design', () => {
        const r = importDbml('Table users {\n  id int\n', 'postgresql');
        expect(r.design).toBeUndefined();
        const [first] = errors(r.diagnostics);
        expect(first).toBeDefined();
        expect(first.line).toBeGreaterThanOrEqual(1);
    });

    it('a reference to a table that is not declared is an error, not a crash', () => {
        const r = importDbml(
            'Table b {\n  id int [pk]\n  a_id int\n}\nRef: b.a_id > a.id\n',
            'postgresql'
        );
        expect(r.design === undefined || r.counts.relationships === 0).toBe(
            true
        );
        expect(r.diagnostics.length).toBeGreaterThan(0);
    });

    it('an array column is refused for a database that has none', () => {
        const r = importDbml(
            'Table t {\n  id int [pk]\n  tags text[]\n}\n',
            'mysql'
        );
        expect(r.design).toBeUndefined();
        expect(errors(r.diagnostics).length).toBeGreaterThan(0);
    });
});
