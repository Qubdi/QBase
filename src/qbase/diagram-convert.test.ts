import { describe, expect, it } from 'vitest';
import { shop } from '@/core/wire/fixtures/shop';
import {
    createDiagramProjector,
    designToDiagram,
    diagramToDesign,
} from './diagram-convert';

const dated = () => ({
    ...structuredClone(shop),
    createdAt: '2026-10-17T09:31:12.000Z',
    updatedAt: '2026-10-17T09:31:12.000Z',
});

describe('the diagram projector (CLI-045)', () => {
    it('builds what a full conversion builds after an edit, and reuses untouched sections', () => {
        const design = diagramToDesign(dated()).design;
        const project = createDiagramProjector();
        const before = project(design);
        const id = design.entities.order[0];
        const edited = {
            ...design,
            updatedAt: design.updatedAt + 1000,
            entities: {
                ...design.entities,
                byId: {
                    ...design.entities.byId,
                    [id]: { ...design.entities.byId[id], name: 'clients' },
                },
            },
        };
        const after = project(edited);
        expect(after).toEqual(designToDiagram(edited));
        expect(after.tables).not.toBe(before.tables);
        expect(after.relationships).toBe(before.relationships);
        expect(after.areas).toBe(before.areas);
        expect(after.notes).toBe(before.notes);
        expect(after.customTypes).toBe(before.customTypes);
        expect(after.dependencies).toBe(before.dependencies);
    });
});
