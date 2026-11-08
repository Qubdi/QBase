import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../examples';
import { buildExample } from '../build-example';
import { sampleDomain } from './sample-domain';

describe('building an example from its tables', () => {
    for (const type of EXAMPLES.map((e) => e.databaseType)) {
        it(`${type}: imports, lays out the areas, and fills in notes and descriptions`, async () => {
            const built = await buildExample(sampleDomain(type));
            if ('problem' in built) throw new Error(built.problem);
            const { design } = built;
            expect(design.entities.order).toHaveLength(5);
            expect(design.links.order.length).toBeGreaterThanOrEqual(5);
            expect(design.regions.order).toHaveLength(2);
            expect(design.memos.order).toHaveLength(3);
            // every note is attached to its area, so it moves with it
            for (const id of design.memos.order)
                expect(design.memos.byId[id].anchor?.kind).toBe('region');
            // every table sits inside its area, and has its description
            for (const id of design.entities.order) {
                const entity = design.entities.byId[id];
                expect(entity.regionId, entity.name).toBeDefined();
                expect(entity.comments, entity.name).toBeTruthy();
            }
            const staff = design.entities.order
                .map((id) => design.entities.byId[id])
                .find((e) => e.name.toLowerCase() === 'staff')!;
            const names = staff.columnIds.map((c) => design.columns[c]);
            expect(names.find((c) => c.name === 'full_name')?.comments).toBe(
                'the name on the badge'
            );
            // no two tables on top of each other
            const spots = design.entities.order.map(
                (id) =>
                    `${design.entities.byId[id].x},${design.entities.byId[id].y}`
            );
            expect(new Set(spots).size).toBe(spots.length);
        });
    }
});
