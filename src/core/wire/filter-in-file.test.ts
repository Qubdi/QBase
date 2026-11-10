import { describe, expect, it } from 'vitest';
import { listOf } from '../model/collection';
import { NOW, rng } from '../testing/helpers';
import { exportFileText } from './file-export';
import { importFileText } from './file-import';
import { shop } from './fixtures/shop';
import { parse } from './parse';
import { serialise } from './serialise';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const read = (json: unknown) => parse(json, { now: NOW, random: rng() });
const withFilter = (filter: unknown) => ({ ...clone(shop), filter });

describe('the table filter is saved in the diagram file', () => {
    it('a diagram with no filter writes no filter key', () => {
        const design = read(shop).design;
        expect(design.filter).toBeUndefined();
        expect('filter' in serialise(design)).toBe(false);
    });

    it('an unrestricted filter writes no filter key either', () => {
        const design = { ...read(shop).design, filter: {} };
        expect('filter' in serialise(design)).toBe(false);
    });

    it('reads the filter and writes it back unchanged', () => {
        const file = withFilter({ schemaIds: ['public'], tableIds: ['t1'] });
        const { design, warnings } = read(file);
        const ids = design.entities.order;
        expect(warnings).toEqual([]);
        expect(design.filter).toEqual({
            schemaIds: ['public'],
            tableIds: [ids[0]],
        });
        expect(serialise(design).filter).toEqual({
            schemaIds: ['public'],
            tableIds: [ids[0]],
        });
    });

    it('keeps a filter that hides every table (empty tableIds)', () => {
        const design = read(withFilter({ tableIds: [] })).design;
        expect(design.filter).toEqual({ tableIds: [] });
        expect(serialise(design).filter).toEqual({ tableIds: [] });
    });

    it('does not keep the filter as an unknown extra key', () => {
        const design = read(withFilter({ tableIds: ['t1'] })).design;
        expect(design.extra?.filter).toBeUndefined();
    });

    it('drops table ids that name no table', () => {
        const design = read(withFilter({ tableIds: ['t1', 'gone'] })).design;
        expect(design.filter?.tableIds).toEqual([design.entities.order[0]]);
    });

    it('ignores a filter of the wrong shape and says so', () => {
        const bad = read(withFilter('nope'));
        expect(bad.design.filter).toBeUndefined();
        expect(bad.warnings.map((w) => w.path)).toContain('filter');

        const badList = read(withFilter({ tableIds: 'x', schemaIds: ['a'] }));
        expect(badList.design.filter).toEqual({ schemaIds: ['a'] });
        expect(badList.warnings.map((w) => w.path)).toContain(
            'filter.tableIds'
        );
    });

    it('a diagram saved without the key still opens with everything shown', () => {
        expect(read(shop).design.filter).toBeUndefined();
    });

    it('an export keeps the filter and renumbers its table ids with the tables', () => {
        const design = read(withFilter({ tableIds: ['t2'] })).design;
        const out = JSON.parse(exportFileText(design));
        const tableIds = out.tables.map((t: { id: string }) => t.id);
        const t2 = tableIds[1];
        expect(out.filter).toEqual({ tableIds: [t2] });
        expect(tableIds).toContain(t2);
    });

    it('an export of a diagram with no filter has none', () => {
        const out = JSON.parse(exportFileText(read(shop).design));
        expect('filter' in out).toBe(false);
    });

    it('an exported file imports with the same tables still shown or hidden', () => {
        const design = read(
            withFilter({ schemaIds: ['public'], tableIds: ['t3'] })
        ).design;
        const names = listOf(design.entities).map((e) => e.name);
        const again = importFileText(exportFileText(design), {
            now: NOW,
            random: rng(3),
        }).design;
        const shown = (d: typeof again) =>
            listOf(d.entities)
                .filter((e) => d.filter?.tableIds?.includes(e.id))
                .map((e) => e.name);
        expect(again.filter?.schemaIds).toEqual(['public']);
        expect(shown(again)).toEqual([names[2]]);
        // fresh ids on import: the filter follows them
        expect(again.filter?.tableIds?.[0]).toBe(again.entities.order[2]);
    });
});
