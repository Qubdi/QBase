import { describe, expect, it } from 'vitest';
import { listOf } from './model/collection';
import { apply } from './commands/apply';
import { planAddColumn, planAddKey } from './commands/plan-column';
import { planAddEntity, planDeleteEntities } from './commands/plan-entity';
import { planLink } from './commands/plan-link';
import { planAddRegion, planAddUserType } from './commands/plan-visual';
import { applyOk, blank, NOW, rng, withTables } from './testing/helpers';
import type { Design } from './model/design';

const names = (d: Design) => listOf(d.entities).map((e) => e.name);

describe('review core-store 8: default names avoid existing names', () => {
    it('tables: add two, delete the first, add one', () => {
        let d = blank();
        d = applyOk(d, planAddEntity(d, { now: NOW, random: rng(1) })).design;
        d = applyOk(d, planAddEntity(d, { now: NOW, random: rng(2) })).design;
        const first = d.entities.order[0];
        d = applyOk(d, planDeleteEntities([first])).design;
        d = applyOk(d, planAddEntity(d, { now: NOW, random: rng(3) })).design;
        const n = names(d);
        expect(new Set(n).size).toBe(n.length);
        expect(n).toEqual(['table_2', 'table_3']);
    });
    it('columns and indexes', () => {
        let d = withTables(['t']);
        const id = d.entities.order[0];
        for (let i = 0; i < 2; i++)
            d = applyOk(
                d,
                planAddColumn(d, id, { now: NOW, random: rng(10 + i) })!
            ).design;
        const second = d.entities.byId[id].columnIds[1];
        d = applyOk(d, {
            type: 'part.remove',
            entityId: id,
            part: 'columns',
            id: second,
        }).design;
        d = applyOk(
            d,
            planAddColumn(d, id, { now: NOW, random: rng(20) })!
        ).design;
        const cn = d.entities.byId[id].columnIds.map((c) => d.columns[c].name);
        expect(new Set(cn).size).toBe(cn.length);

        for (let i = 0; i < 2; i++)
            d = applyOk(
                d,
                planAddKey(d, id, { now: NOW, random: rng(30 + i) })!
            ).design;
        const k1 = d.entities.byId[id].keyIds.find(
            (k) => d.keys[k].label !== ''
        )!;
        d = applyOk(d, {
            type: 'part.remove',
            entityId: id,
            part: 'keys',
            id: k1,
        }).design;
        d = applyOk(
            d,
            planAddKey(d, id, { now: NOW, random: rng(40) })!
        ).design;
        const kn = d.entities.byId[id].keyIds
            .map((k) => d.keys[k].label)
            .filter((l) => l !== '');
        expect(new Set(kn).size).toBe(kn.length);
    });
    it('types and regions', () => {
        let d = blank();
        for (let i = 0; i < 2; i++) {
            d = applyOk(d, planAddUserType(d, { random: rng(50 + i) })).design;
            d = applyOk(d, planAddRegion(d, { random: rng(60 + i) })).design;
        }
        d = applyOk(d, {
            type: 'item.remove',
            collection: 'userTypes',
            id: d.userTypes.order[0],
        }).design;
        d = applyOk(d, {
            type: 'item.remove',
            collection: 'regions',
            id: d.regions.order[0],
        }).design;
        d = applyOk(d, planAddUserType(d, { random: rng(70) })).design;
        d = applyOk(d, planAddRegion(d, { random: rng(71) })).design;
        const t = listOf(d.userTypes).map((x) => x.name);
        const r = listOf(d.regions).map((x) => x.label);
        expect(new Set(t).size).toBe(2 + 0);
        expect(new Set(r).size).toBe(r.length);
    });
});

describe('review core-store 2: new link names', () => {
    it('keeps the specified name first and avoids a second identical one', () => {
        let d = withTables(['users', 'orders', 'invoices']);
        const [u, o, i] = d.entities.order;
        const col = (e: string) => d.entities.byId[e].columnIds[0];
        const l1 = planLink(
            d,
            { entityId: u, columnId: col(u) },
            { entityId: o, columnId: col(o) },
            { random: rng(5), now: NOW }
        );
        if (l1.kind !== 'ok') throw new Error('refused');
        expect(l1.link.name).toBe('users_id_fk');
        d = applyOk(d, l1.command).design;
        const l2 = planLink(
            d,
            { entityId: u, columnId: col(u) },
            { entityId: i, columnId: col(i) },
            { random: rng(6), now: NOW }
        );
        if (l2.kind !== 'ok') throw new Error('refused');
        expect(l2.link.name).not.toBe('users_id_fk');
        expect(l2.link.name).toContain('invoices');
    });
});

describe('review core-store 12: link update is an exact inverse', () => {
    it('undoes a single-field patch that normalised many/many', () => {
        let d = withTables(['a', 'b']);
        const [a, b] = d.entities.order;
        const col = (e: string) => d.entities.byId[e].columnIds[0];
        const l = planLink(
            d,
            { entityId: a, columnId: col(a) },
            { entityId: b, columnId: col(b) },
            { random: rng(5), now: NOW }
        );
        if (l.kind !== 'ok') throw new Error('refused');
        d = applyOk(d, l.command).design;
        const id = d.links.order[0];
        d = applyOk(d, {
            type: 'item.update',
            collection: 'links',
            id,
            patch: { sourceCardinality: 'many', targetCardinality: 'one' },
        }).design;
        const before = d;
        const r = applyOk(d, {
            type: 'item.update',
            collection: 'links',
            id,
            patch: { targetCardinality: 'many' },
        });
        const back = applyOk(r.design, r.inverse).design;
        expect(back.links.byId[id]).toEqual(before.links.byId[id]);
    });
});

describe('review core-store 13: geometry', () => {
    it('refuses a bad box and clamps entity width', () => {
        let d = blank();
        d = applyOk(d, planAddRegion(d, { random: rng(1) })).design;
        const id = d.regions.order[0];
        for (const box of [
            { x: NaN, y: 0, width: 10, height: 10 },
            { x: 0, y: 0, width: Infinity, height: 10 },
            { x: 0, y: 0, width: 0, height: 10 },
            { x: 0, y: 0, width: 10, height: -1 },
        ]) {
            const r = apply(
                d,
                {
                    type: 'item.update',
                    collection: 'regions',
                    id,
                    patch: { box },
                },
                { now: NOW }
            );
            expect(r.ok).toBe(false);
        }
        const t = withTables(['t']);
        const e = t.entities.order[0];
        const wide = applyOk(t, {
            type: 'entity.update',
            id: e,
            patch: { width: 5000 },
        }).design;
        expect(wide.entities.byId[e].width).toBe(450);
        const thin = applyOk(t, {
            type: 'entity.update',
            id: e,
            patch: { width: 1 },
        }).design;
        expect(thin.entities.byId[e].width).toBe(224);
    });
});
