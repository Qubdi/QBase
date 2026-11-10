import { describe, expect, it } from 'vitest';
import { createRevisionTracker } from '@/lib/qubdi/revision';
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

describe('the table filter in the projected diagram', () => {
    it('carries the filter, and keeps the same object while it is unchanged', () => {
        const design = diagramToDesign(dated()).design;
        const project = createDiagramProjector();
        const id = design.entities.order[0];
        const filtered = { ...design, filter: { tableIds: [id] } };
        const first = project(filtered);
        expect(first.filter).toEqual({ tableIds: [id] });
        const edited = {
            ...filtered,
            entities: {
                ...filtered.entities,
                byId: {
                    ...filtered.entities.byId,
                    [id]: { ...filtered.entities.byId[id], name: 'clients' },
                },
            },
        };
        expect(project(edited).filter).toBe(first.filter);
    });

    it('a changed filter is a changed diagram for autosave', () => {
        const design = diagramToDesign(dated()).design;
        const project = createDiagramProjector();
        const revision = createRevisionTracker();
        const before = revision(project(design));
        const hidden = { ...design, filter: { tableIds: [] } };
        expect(revision(project(hidden))).toBe(before + 1);
        expect(revision(project(hidden))).toBe(before + 1);
    });
});
