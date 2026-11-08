import { describe, expect, it } from 'vitest';
import { buildExample } from '../build-example';
import { EXAMPLES } from '../examples';
import { parseColumn } from '../spec';
import { writeScript } from '../write-script';

describe('the examples', () => {
    it('has one for each of the six databases', () => {
        expect(EXAMPLES.map((e) => e.databaseType).sort()).toEqual(
            [
                'mariadb',
                'mysql',
                'oracle',
                'postgresql',
                'sql_server',
                'sqlite',
            ].sort()
        );
        expect(new Set(EXAMPLES.map((e) => e.name)).size).toBe(EXAMPLES.length);
        expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    });

    for (const example of EXAMPLES) {
        const { domain } = example;
        describe(`${example.id}: ${example.name} (${example.databaseType})`, () => {
            it('is large: 30 to 50 tables in 4 to 8 areas, with 4 to 10 notes', () => {
                expect(domain.tables.length).toBeGreaterThanOrEqual(30);
                expect(domain.tables.length).toBeLessThanOrEqual(50);
                expect(domain.areas.length).toBeGreaterThanOrEqual(4);
                expect(domain.areas.length).toBeLessThanOrEqual(8);
                expect(domain.notes.length).toBeGreaterThanOrEqual(4);
                expect(domain.notes.length).toBeLessThanOrEqual(10);
            });

            it('puts every table in an area, with at least 3 tables in each area', () => {
                const areas = new Set(domain.areas.map((a) => a.id));
                expect(areas.size).toBe(domain.areas.length);
                for (const t of domain.tables)
                    expect(areas.has(t.area), `${t.name}: area ${t.area}`).toBe(
                        true
                    );
                for (const a of domain.areas)
                    expect(
                        domain.tables.filter((t) => t.area === a.id).length,
                        `area ${a.id}`
                    ).toBeGreaterThanOrEqual(3);
                expect(
                    new Set(domain.areas.map((a) => a.tone % 13)).size,
                    'every area has its own colour'
                ).toBe(domain.areas.length);
                for (const a of domain.areas) {
                    expect(a.tone).toBeGreaterThanOrEqual(0);
                    expect(a.tone).toBeLessThanOrEqual(12);
                }
            });

            it('writes notes of at most 160 characters, each above a real area', () => {
                const areas = new Set(domain.areas.map((a) => a.id));
                for (const n of domain.notes) {
                    expect(areas.has(n.area), n.text).toBe(true);
                    expect(n.text.length, n.text).toBeLessThanOrEqual(160);
                    expect(n.text.length, n.text).toBeGreaterThanOrEqual(30);
                }
            });

            it('names tables and columns in lower snake case, once each', () => {
                const names = domain.tables.map((t) => t.name);
                expect(new Set(names).size).toBe(names.length);
                for (const t of domain.tables) {
                    expect(t.name).toMatch(/^[a-z][a-z0-9_]*$/);
                    const columns = t.columns.map(parseColumn);
                    const own = columns.map((c) => c.name);
                    expect(new Set(own).size, t.name).toBe(own.length);
                    for (const c of columns)
                        expect(c.name, t.name).toMatch(/^[a-z][a-z0-9_]*$/);
                    expect(columns.length, t.name).toBeGreaterThanOrEqual(2);
                    expect(columns.length, t.name).toBeLessThanOrEqual(18);
                }
            });

            it('describes every table in a sentence and most columns', () => {
                let columns = 0;
                let described = 0;
                for (const t of domain.tables) {
                    expect(t.about.length, t.name).toBeGreaterThanOrEqual(20);
                    expect(t.about.length, t.name).toBeLessThanOrEqual(140);
                    for (const c of t.columns.map(parseColumn)) {
                        columns++;
                        if (c.about) described++;
                    }
                }
                expect(described / columns).toBeGreaterThanOrEqual(0.5);
            });

            it('links the tables: most tables point at another, and no table is alone', () => {
                const byName = new Map(domain.tables.map((t) => [t.name, t]));
                const touched = new Set<string>();
                let links = 0;
                for (const t of domain.tables)
                    for (const c of t.columns.map(parseColumn))
                        if (c.references) {
                            links++;
                            touched.add(t.name);
                            touched.add(c.references.table);
                            expect(
                                byName.has(c.references.table),
                                `${t.name}.${c.name} -> ${c.references.table}`
                            ).toBe(true);
                        }
                expect(links).toBeGreaterThanOrEqual(domain.tables.length);
                const alone = domain.tables
                    .map((t) => t.name)
                    .filter((n) => !touched.has(n));
                expect(alone).toEqual([]);
                // several relationships cross from one area to another
                const area = (name: string) => byName.get(name)!.area;
                let across = 0;
                for (const t of domain.tables)
                    for (const c of t.columns.map(parseColumn))
                        if (c.references && area(c.references.table) !== t.area)
                            across++;
                expect(across).toBeGreaterThanOrEqual(6);
            });

            it('has an order the SQL can be written in (no table points back around to itself)', () => {
                expect(() => writeScript(domain)).not.toThrow();
            });

            it('imports without a warning and lays out as a diagram', async () => {
                const built = await buildExample(domain);
                if ('problem' in built) throw new Error(built.problem);
                const { design } = built;
                expect(design.entities.order).toHaveLength(
                    domain.tables.length
                );
                expect(design.regions.order).toHaveLength(domain.areas.length);
                expect(design.memos.order).toHaveLength(domain.notes.length);
                expect(design.links.order.length).toBeGreaterThanOrEqual(
                    domain.tables.length - 4
                );
                for (const id of design.entities.order) {
                    const e = design.entities.byId[id];
                    expect(e.regionId, e.name).toBeDefined();
                    expect(e.comments, e.name).toBeTruthy();
                }
            });
        });
    }
});
