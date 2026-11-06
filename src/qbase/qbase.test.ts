import { describe, expect, it } from 'vitest';
import { shop } from '@/core/wire/fixtures/shop';
import { createEditorStore } from '@/store/editor-store';
import {
    createDiagramProjector,
    designToDiagram,
    diagramSchema,
    diagramToDesign,
} from './diagram-convert';
import { createEditorApi } from './editor-api';
import { DatabaseType } from './diagram-types';
import type { Diagram, DBIndex } from './diagram-types';

const dated = () => ({
    ...structuredClone(shop),
    createdAt: '2026-10-17T09:30:00.000Z',
    updatedAt: '2026-10-17T09:31:12.000Z',
});

const open = (readonly = false) => {
    const design = diagramToDesign(dated()).design;
    const store = createEditorStore({ design, readonly });
    return { store, api: createEditorApi(store) };
};

describe('the saved shape of a design (C3, DAT-024)', () => {
    it('keeps the saved JSON keys and holds the two dates as Date', () => {
        const diagram = designToDiagram(diagramToDesign(dated()).design);
        expect(diagram.createdAt).toBeInstanceOf(Date);
        expect(diagram.updatedAt.toISOString()).toBe(
            '2026-10-17T09:31:12.000Z'
        );
        const table = diagram.tables![0];
        expect(Object.keys(table)).toEqual(
            expect.arrayContaining([
                'fields',
                'indexes',
                'isView',
                'parentAreaId',
            ])
        );
        expect(diagram.relationships![0]).toHaveProperty('sourceTableId');
        expect(diagram.qbaseFormat).toBe(1);
    });

    it('keeps every id as it was, never renumbering (B3)', () => {
        const diagram = designToDiagram(diagramToDesign(dated()).design);
        expect(diagram.tables!.map((t) => t.id)).toEqual(
            shop.tables.map((t) => t.id)
        );
        expect(diagram.relationships!.map((r) => r.id)).toEqual(
            shop.relationships.map((r) => r.id)
        );
    });

    it('serialises to JSON and back without loss (server content)', () => {
        const diagram = designToDiagram(diagramToDesign(dated()).design);
        const sent = JSON.parse(JSON.stringify(diagram));
        expect(sent.createdAt).toBe('2026-10-17T09:30:00.000Z');
        const again = designToDiagram(diagramToDesign(sent).design);
        expect(JSON.parse(JSON.stringify(again))).toEqual(sent);
    });
});

describe('diagramSchema (C3)', () => {
    it('accepts a diagram revived from server JSON', () => {
        const parsed = diagramSchema.safeParse({
            ...dated(),
            createdAt: new Date(dated().createdAt),
            updatedAt: new Date(dated().updatedAt),
        });
        expect(parsed.success).toBe(true);
    });

    it('fills missing collections with empty ones', () => {
        const parsed = diagramSchema.safeParse({
            id: 'a',
            name: 'A',
            databaseType: 'mysql',
            createdAt: new Date(0),
            updatedAt: new Date(0),
        });
        expect(parsed.success && parsed.data.tables).toEqual([]);
    });

    it.each([
        ['not an object', 'text'],
        ['no id', { name: 'A', databaseType: 'mysql' }],
        ['unknown database', { id: 'a', name: 'A', databaseType: 'nope' }],
        [
            'tables not a list',
            { id: 'a', name: 'A', databaseType: 'mysql', tables: {} },
        ],
        [
            'a table without an id',
            {
                id: 'a',
                name: 'A',
                databaseType: 'mysql',
                tables: [{ name: 'x' }],
            },
        ],
    ])('refuses %s', (_, input) => {
        expect(diagramSchema.safeParse(input).success).toBe(false);
    });

    it('turns many-to-many into one-to-many (DAT-052)', () => {
        const content = dated();
        content.relationships[0] = {
            ...content.relationships[0],
            sourceCardinality: 'many',
            targetCardinality: 'many',
        };
        const parsed = diagramSchema.parse(content);
        expect(parsed.relationships![0]).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
    });
});

describe('what an edit replaces (C1)', () => {
    it('keeps the array of every section the edit did not touch', () => {
        const { store, api } = open();
        const project = createDiagramProjector();
        const before = project(store.getState().design);
        api.updateTable('t1', { name: 'clients' });
        const after = project(store.getState().design);
        expect(after.tables).not.toBe(before.tables);
        expect(after.relationships).toBe(before.relationships);
        expect(after.areas).toBe(before.areas);
        expect(after.notes).toBe(before.notes);
        expect(after.customTypes).toBe(before.customTypes);
        expect(after.dependencies).toBe(before.dependencies);
    });

    it('gives the same diagram again while the design is the same', () => {
        const { api } = open();
        expect(api.currentDiagram()).toBe(api.currentDiagram());
    });

    it('moves updatedAt with every edit', () => {
        const { api } = open();
        const before = api.currentDiagram().updatedAt.getTime();
        api.updateTable('t1', { name: 'clients' });
        expect(api.currentDiagram().updatedAt.getTime()).toBeGreaterThan(
            before
        );
    });
});

describe('the edits QBase makes (C1)', () => {
    const index: DBIndex = {
        id: 'ix-new',
        name: 'by_name',
        unique: false,
        fieldIds: ['f1'],
        createdAt: 5,
    };

    it('adds and removes an index, each undoable', () => {
        const { store, api } = open();
        api.addIndex('t1', index);
        expect(
            api.currentDiagram().tables![0].indexes.map((i) => i.id)
        ).toContain('ix-new');
        store.getState().undo();
        expect(
            api.currentDiagram().tables![0].indexes.map((i) => i.id)
        ).not.toContain('ix-new');
        store.getState().redo();
        api.removeIndex('t1', 'ix-new');
        expect(
            api.currentDiagram().tables![0].indexes.map((i) => i.id)
        ).not.toContain('ix-new');
    });

    it('updates a column by its saved keys, length as text', () => {
        const { api } = open();
        api.updateField('t1', 'f2', {
            name: 'mail',
            characterMaximumLength: '120',
            type: { id: 'text', name: 'text' },
        });
        const field = api
            .currentDiagram()
            .tables![0].fields.find((f) => f.id === 'f2')!;
        expect(field).toMatchObject({
            name: 'mail',
            characterMaximumLength: '120',
            type: { id: 'text', name: 'text' },
        });
    });

    it('updates a table by its saved keys', () => {
        const { api } = open();
        api.updateTable('t1', {
            name: 'clients',
            isView: true,
            color: '#ff0000',
        });
        expect(api.currentDiagram().tables![0]).toMatchObject({
            name: 'clients',
            isView: true,
            color: '#ff0000',
        });
    });

    it('refuses to change what has its own operations', () => {
        const { api } = open();
        expect(() => api.updateTable('t1', { fields: [] })).toThrow();
    });

    it('refuses every edit when read-only (C2) and says why', () => {
        const { store, api } = open(true);
        const before = store.getState().design;
        expect(() => api.updateTable('t1', { name: 'x' })).toThrow(
            /cannot be edited/
        );
        expect(store.getState().design).toBe(before);
        expect(store.getState().history.undo).toHaveLength(0);
    });
});

describe('replacing the whole diagram (C8)', () => {
    const renamed = (diagram: Diagram): Diagram => ({
        ...diagram,
        tables: diagram.tables!.map((t) => ({ ...t, name: `${t.name}_v2` })),
    });

    it('replaceDiagram is one undo step that restores the previous diagram', () => {
        const { store, api } = open();
        const before = api.currentDiagram();
        api.replaceDiagram(renamed(before));
        expect(api.currentDiagram().tables![0].name).toBe('customers_v2');
        expect(store.getState().history.undo).toHaveLength(1);
        store.getState().undo();
        expect(api.currentDiagram().tables![0].name).toBe('customers');
    });

    it('updateDiagramData with resetHistory false leaves the history; addUndoAction adds the one step', () => {
        const { store, api } = open();
        api.updateTable('t1', { name: 'first' });
        const previous = structuredClone(api.currentDiagram());
        const next = renamed(previous);
        api.updateDiagramData(next, { resetHistory: false });
        expect(store.getState().history.undo).toHaveLength(1);
        api.addUndoAction({
            action: 'updateDiagramData',
            redoData: { diagram: next },
            undoData: { diagram: previous },
        });
        api.resetRedoStack();
        expect(store.getState().history.undo).toHaveLength(2);
        store.getState().undo();
        expect(api.currentDiagram().tables![0].name).toBe('first');
        store.getState().redo();
        expect(api.currentDiagram().tables![0].name).toBe('first_v2');
    });

    it('updateDiagramData by default starts the history again', () => {
        const { store, api } = open();
        api.updateTable('t1', { name: 'first' });
        api.updateDiagramData(renamed(api.currentDiagram()));
        expect(store.getState().history.undo).toHaveLength(0);
    });
});

describe('the side panel and canvas (C9, C10)', () => {
    it('shows a table in the panel and asks the canvas to focus it', () => {
        const { store, api } = open();
        store.getState().hidePanel();
        expect(api.isSidePanelShown()).toBe(false);
        api.showTableInPanel('t1');
        api.focusTable('t1');
        expect(api.isSidePanelShown()).toBe(true);
        expect(store.getState().ui.panel.expandedEntityId).toBe('t1');
        expect(store.getState().ui.focus?.entityId).toBe('t1');
    });

    it('knows the database type as the saved enum value', () => {
        const { api } = open();
        expect(api.databaseType()).toBe(DatabaseType.POSTGRESQL);
    });
});
