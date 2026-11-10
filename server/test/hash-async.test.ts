import { monitorEventLoopDelay } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { diagramHash, diagramHashAsync } from '../src/lib/hash.js';

const diagram = (tables: number) => ({
    id: 'd',
    name: 'n',
    updatedAt: 'ignored',
    tables: Array.from({ length: tables }, (_, i) => ({
        name: `t${i}`,
        id: `id${i}`,
        fields: Array.from({ length: 12 }, (_, k) => ({
            primaryKey: k === 0,
            name: `c${k}`,
            nullable: true,
            note: undefined,
            type: { name: 'integer', id: 'integer' },
        })),
    })),
    relationships: [],
});

describe('diagramHashAsync', () => {
    it('gives the hash diagramHash gives', async () => {
        const d = diagram(50);
        expect(await diagramHashAsync('title', d)).toBe(diagramHash('title', d));
    });

    it('agrees on odd shapes: undefined, null, empty, nested arrays, key order', async () => {
        const shapes: unknown[] = [
            {},
            [],
            null,
            { a: undefined, b: null, c: [undefined, null, 1, 'x', [], {}] },
            { z: 1, a: { y: [1, [2, [3, { q: undefined, p: 'é"\\n' }]]], b: 2 } },
            { tables: [[], [[]], { x: { y: { z: { w: 1 } } } }] },
            [1, 2, 3],
            'text',
        ];
        for (const shape of shapes) {
            expect(await diagramHashAsync('t', shape)).toBe(diagramHash('t', shape));
        }
    });

    it('does not depend on key order, and ignores the top-level updatedAt', async () => {
        const a = { x: 1, y: { b: 1, a: 2 }, updatedAt: '1' };
        const b = { y: { a: 2, b: 1 }, x: 1, updatedAt: '2' };
        expect(await diagramHashAsync('t', a)).toBe(await diagramHashAsync('t', b));
    });

    it('lets the event loop run while it hashes a large diagram', async () => {
        const d = diagram(30_000);
        const monitor = monitorEventLoopDelay({ resolution: 2 });
        monitor.enable();
        const hash = await diagramHashAsync('title', d);
        monitor.disable();
        expect(hash).toBe(diagramHash('title', d));
        // one pass in a single go holds the loop for the whole hash
        expect(monitor.max / 1e6).toBeLessThan(150);
    }, 60_000);
});
