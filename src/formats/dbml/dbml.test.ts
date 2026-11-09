import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import type { Design } from '@/core/model/design';
import {
    sampleS1,
    sampleS2,
    sampleS3,
} from '@/dialects/testing/sample-designs';
import { exportDbml } from './export-dbml';
import { importDbml } from './import-dbml';
import { checkExpression } from '../sql/check-expression';

const names = (d: Design) =>
    listOf(d.entities).map((e) => [
        e.name,
        e.columnIds.map((id) => {
            const c = d.columns[id];
            return [
                c.name,
                c.type.name,
                c.primaryKey,
                c.nullable,
                c.unique,
                c.length,
                c.precision,
                c.scale,
                c.default,
            ];
        }),
    ]);

describe('EXP-050 EXP-052 EXP-053 EXP-055 EXP-056 DBML export', () => {
    const s1 = sampleS1('postgresql');
    it('writes the Ref line exactly and fields with attributes', () => {
        const { text } = exportDbml(s1);
        expect(text).toContain(
            'Ref "fk_0_fk_orders_customers":"customers"."id" < "orders"."customer_id"'
        );
        expect(text).toContain('"id" integer [pk, not null, increment]');
        expect(text).toContain('"email" varchar(120) [unique, not null]');
        expect(text).toContain(
            '"created_at" timestamp [not null, default: `now()`]'
        );
        expect(text).toContain('"total" numeric(10,2) [not null, default: 0]');
    });
    it('inline form puts the reference on the key column', () => {
        const { text } = exportDbml(s1, { inline: true });
        expect(text).toContain(
            '"customer_id" integer [not null, ref: > "customers"."id"]'
        );
        expect(text).not.toContain('Ref ');
    });
    it('EXP-053 composite key, indexes, checks and comments', () => {
        const { text } = exportDbml(sampleS2('postgresql'));
        expect(text).toContain('("student_id", "course_code") [pk]');
        expect(text).toContain(
            '"course_code", "grade") [name: "idx_enrol_course"]'
        );
        expect(text).toContain('`credits > 0`');
        expect(text).toContain("Note: 'Course catalogue'");
        expect(text).toContain('"courses"');
    });
    it('EXP-054 enums first, arrays as type[]', () => {
        const { text } = exportDbml(sampleS3('postgresql'));
        expect(
            text.startsWith(
                'Enum "ticket_status" {\n    "open"\n    "closed"\n    "it\'s done"\n}'
            )
        ).toBe(true);
        expect(text).toContain('"tags" text[]');
        expect(text).toContain('type: gin');
    });
    it('EXP-051 tables without fields are left out', () => {
        const bare: Design = {
            ...s1,
            columns: {},
            entities: { ...s1.entities },
        };
        expect(
            exportDbml({
                ...bare,
                entities: {
                    ...bare.entities,
                    byId: Object.fromEntries(
                        Object.entries(bare.entities.byId).map(([k, e]) => [
                            k,
                            { ...e, columnIds: [] },
                        ])
                    ),
                },
            }).text
        ).toBe('');
    });
});

describe('IMP-045 to IMP-055 DBML import and round trip', () => {
    it.each([
        ['S1', sampleS1('postgresql')],
        ['S2', sampleS2('postgresql')],
        ['S3', sampleS3('postgresql')],
    ] as const)('%s: export, import, export is stable', (_label, design) => {
        for (const inline of [false, true]) {
            const first = exportDbml(design, { inline }).text;
            const imported = importDbml(first, 'postgresql');
            expect(imported.diagnostics).toEqual([]);
            const again = exportDbml(imported.design!, { inline }).text;
            // a table without schema comes back in the default schema (IMP-052), so "public". is ignored
            const plain = (x: string) =>
                x
                    .replace(/fk_\d+_[A-Za-z0-9_]*/g, 'fk')
                    .replace(/"public"\./g, '');
            expect(plain(again)).toBe(plain(first));
            expect(
                names(imported.design!)
                    .map((t) => t[0])
                    .sort()
            ).toEqual(
                names(design)
                    .map((t) => t[0])
                    .sort()
            );
        }
    });
    it('IMP-050 IMP-052 IMP-054 relationships, enums, default quotes kept', () => {
        const r = importDbml(
            `Enum mood {\n  calm\n  busy\n}\nTable a {\n  id int [pk]\n  m mood [default: 'calm']\n}\nTable b {\n  id int [pk]\n  a_id int [ref: > a.id]\n}\nRef: b.id - a.id\n`,
            'postgresql'
        );
        const d = r.design!;
        expect(r.diagnostics).toEqual([]);
        expect(listOf(d.userTypes)[0]).toMatchObject({
            name: 'mood',
            schema: 'public',
            values: ['calm', 'busy'],
        });
        const a = d.columns[d.entities.byId[d.entities.order[0]].columnIds[1]];
        expect(a).toMatchObject({ default: "'calm'", type: { name: 'mood' } });
        const links = listOf(d.links);
        // an inline reference is stored with the referenced table first
        expect(links[0]).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
        expect(links[1]).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'one',
        });
        expect(d.entities.byId[links[0].sourceEntityId].name).toBe('a');
    });
    it('IMP-049 many-to-many is an error', () => {
        const r = importDbml(
            'Table a {\n  id int\n}\nTable b {\n  id int\n}\nRef: a.id <> b.id\n',
            'postgresql'
        );
        expect(r.design).toBeUndefined();
        expect(r.diagnostics[0].message).toContain(
            'Many-to-many references (<>) are not supported'
        );
        expect(r.diagnostics[0].line).toBe(7);
    });
    it('IMP-045 syntax errors carry line and column', () => {
        const r = importDbml('Table a {\n  id int [\n}\n', 'postgresql');
        expect(r.design).toBeUndefined();
        expect(r.diagnostics[0].line).toBeGreaterThan(0);
    });
    it('IMP-046 TableGroup, Note blocks and header colours are ignored', () => {
        const r = importDbml(
            'Table a [headercolor: #ff0000] {\n  id int\n}\nTableGroup g {\n  a\n}\n',
            'postgresql'
        );
        expect(r.counts.tables).toBe(1);
    });
    it('IMP-047 arrays only where supported', () => {
        const ok = importDbml('Table a {\n  tags text[]\n}\n', 'postgresql');
        expect(
            ok.design!.columns[Object.keys(ok.design!.columns)[0]]
        ).toMatchObject({ isArray: true, type: { name: 'text' } });
        const no = importDbml('Table a {\n  tags text[]\n}\n', 'mysql');
        expect(no.design).toBeUndefined();
        expect(no.diagnostics[0].message).toBe(
            'Array types are not supported for MySQL database. Field "tags" has array type "text[]" which is not allowed.'
        );
        expect(no.diagnostics[0].line).toBe(2);
    });
    it('reads arrays and checks the same from a file with Windows line endings', () => {
        const crlf = (text: string) => text.replace(/\n/g, '\r\n');
        const ok = importDbml(
            crlf('Table a {\n  tags text[]\n  n int [check: `n > 0`]\n}\n'),
            'postgresql'
        );
        const columns = Object.values(ok.design!.columns);
        expect(columns.find((c) => c.name === 'tags')).toMatchObject({
            isArray: true,
            type: { name: 'text' },
        });
        expect(
            Object.values(ok.design!.rules).map((x) => x.expression)
        ).toEqual(['n > 0']);
    });
    it('links a field to an enum whose name has capitals', () => {
        const r = importDbml(
            'enum Status {\n  open\n  closed\n}\nTable a {\n  s Status\n}\n',
            'postgresql'
        );
        const d = r.design!;
        const column = Object.values(d.columns).find((c) => c.name === 's')!;
        expect(column.type.name).toBe('Status');
        const types = Object.values(d.userTypes.byId);
        expect(types.map((t) => t.name)).toEqual(['Status']);
    });
    it('keeps array and check settings apart for same-named tables in two schemas', () => {
        const r = importDbml(
            'Table a.t {\n  tags text[]\n  n int [check: `n > 0`]\n}\nTable b.t {\n  tags text\n  n int\n}\n',
            'postgresql'
        );
        const d = r.design!;
        const tagsOf = (schema: string) =>
            Object.values(d.entities.byId)
                .filter((e) => e.schema === schema)
                .flatMap((e) => e.columnIds.map((id) => d.columns[id]))
                .find((c) => c.name === 'tags')!;
        expect(tagsOf('a').isArray).toBe(true);
        expect(tagsOf('b').isArray).toBeUndefined();
        expect(Object.values(d.rules)).toHaveLength(1);
    });
    it('IMP-048 checks from the field setting and the checks block', () => {
        const r = importDbml(
            "Table a {\n  n int [check: `n > 0`]\n  m int\n  checks {\n    `m < 9` [name: 'c']\n  }\n}\n",
            'postgresql'
        );
        const d = r.design!;
        expect(
            listOf({ byId: d.rules, order: Object.keys(d.rules) })
                .map((x) => x.expression)
                .sort()
        ).toEqual(['m < 9', 'n > 0']);
        const bad = importDbml(
            'Table a {\n  n int [check: `n > (0`]\n}\n',
            'postgresql'
        );
        expect(bad.design).toBeUndefined();
        expect(bad.diagnostics[0].line).toBe(2);
    });
    it('IMP-051 composite primary key from an indexes block, name kept', () => {
        const r = importDbml(
            'Table a {\n  x int\n  y int\n  Indexes {\n    (x, y) [pk, name: "a_pk"]\n  }\n}\n',
            'postgresql'
        );
        const d = r.design!;
        const e = d.entities.byId[d.entities.order[0]];
        expect(e.columnIds.map((id) => d.columns[id].primaryKey)).toEqual([
            true,
            true,
        ]);
        expect(d.keys[e.keyIds[0]]).toMatchObject({ label: 'a_pk', pk: true });
    });
    it('IMP-053 accents are kept', () => {
        const r = importDbml(
            'Table "ciudad" {\n  "año" int\n}\n',
            'postgresql'
        );
        expect(Object.values(r.design!.columns)[0].name).toBe('año');
    });
    it('IMP-055 tables get the layout pass, no overlap', () => {
        const r = importDbml(
            'Table a {\n  id int\n}\nTable b {\n  id int\n}\n',
            'postgresql'
        );
        const [p, q2] = listOf(r.design!.entities);
        expect(p.x === q2.x && p.y === q2.y).toBe(false);
    });
});

describe('EXP-049 check expression checker', () => {
    it.each([
        ['credits > 0', false],
        ["status IN ('a','b') AND length(name) > 2", false],
        ['', true],
        ['(a > 1', true],
        ['a > 1)', true],
        ["a = 'x", true],
        ['a > 1; drop table x', true],
        ['a IN (SELECT 1)', true],
        ['a > 1 -- c', true],
    ])('%j', (expr, bad) => {
        const p = checkExpression(expr);
        expect(!!p).toBe(bad);
        if (p) expect(p.line).toBeGreaterThan(0);
    });
});
