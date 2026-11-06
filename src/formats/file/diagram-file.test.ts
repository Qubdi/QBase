import { describe, expect, it } from 'vitest';
import { sampleS1 } from '@/dialects/testing/sample-designs';
import { diagramFile } from './diagram-file';

describe('EXP-058 EXP-059 JSON export', () => {
    const file = diagramFile(sampleS1('postgresql'));
    const json = JSON.parse(file.text);
    it('names the file and indents by two spaces', () => {
        expect(file.fileName).toBe('QBase(sample).json');
        expect(file.text.split('\n')[1].startsWith('  "')).toBe(true);
    });
    it('writes the version key and running string ids', () => {
        expect(json.qbaseFormat).toBe(1);
        // core/wire numbers the diagram itself first, so the first table is "1" (spec 9.3 starts at the table)
        expect(json.id).toBe('0');
        expect(json.tables[0].id).toBe('1');
        expect(
            json.tables[0].fields.every((f: { id: string }) =>
                /^\d+$/.test(f.id)
            )
        ).toBe(true);
        const ids = [
            json.id,
            ...json.tables.flatMap(
                (t: {
                    id: string;
                    fields: { id: string }[];
                    indexes: { id: string }[];
                }) => [
                    t.id,
                    ...t.fields.map((f) => f.id),
                    ...t.indexes.map((i) => i.id),
                ]
            ),
            ...json.relationships.map((r: { id: string }) => r.id),
        ];
        expect(new Set(ids).size).toBe(ids.length);
    });
    it('is the same file every time except the dates', () => {
        expect(diagramFile(sampleS1('postgresql')).text).toBe(file.text);
    });
    it('carries no filter or config', () => {
        expect(Object.keys(json)).not.toContain('filter');
        expect(Object.keys(json)).not.toContain('config');
    });
});
