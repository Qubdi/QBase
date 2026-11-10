import { describe, expect, it } from 'vitest';
import { cardHeight, layoutTables } from './layout';
import type { LayoutNode } from './layout';

describe('layoutTables', () => {
    it('places a 2000-link hub without overlaps and in reasonable time (CLI-028)', () => {
        const leaves: LayoutNode[] = Array.from({ length: 2000 }, (_, i) => ({
            id: `t${i}`,
            group: 'g',
            columnCount: 3,
            neighbours: ['hub'],
        }));
        const hub: LayoutNode = {
            id: 'hub',
            group: 'g',
            columnCount: 3,
            neighbours: leaves.map((l) => l.id),
        };
        const started = Date.now();
        const out = layoutTables([hub, ...leaves]);
        expect(Date.now() - started).toBeLessThan(3000);
        expect(out.size).toBe(2001);
        const h = cardHeight(3);
        const seen = new Set<string>();
        for (const p of out.values()) {
            const key = `${p.x},${p.y}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(h).toBeGreaterThan(0);
        }
    });
});
