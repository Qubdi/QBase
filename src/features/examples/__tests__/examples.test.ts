import { describe, expect, it } from 'vitest';
import { DATABASE_TYPES } from '@/core/model/database';
import { analyzeImport } from '@/features/import/analyze-import';
import { EXAMPLES } from '../examples';

describe('the examples', () => {
    it('has one for every database that is not Generic, each with its own subject', () => {
        const types = EXAMPLES.map((e) => e.databaseType).sort();
        expect(types).toEqual(
            DATABASE_TYPES.filter((t) => t !== 'generic').sort()
        );
        expect(new Set(EXAMPLES.map((e) => e.name)).size).toBe(EXAMPLES.length);
        expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    });

    for (const example of EXAMPLES) {
        it(`${example.name} (${example.databaseType}) imports without a problem`, async () => {
            const result = await analyzeImport(example.text, {
                method: example.format,
                databaseType: example.databaseType,
                diagramName: example.name,
            });
            expect(
                result.diagnostics.filter((d) => d.severity === 'error')
            ).toEqual([]);
            expect(
                result.diagnostics.filter((d) => d.severity !== 'info')
            ).toEqual([]);
            expect(result.blocked).toBe(false);
            expect(result.design).toBeDefined();
            expect(result.counts.tables).toBeGreaterThanOrEqual(5);
            expect(result.counts.relationships).toBeGreaterThanOrEqual(4);
        });
    }
});
