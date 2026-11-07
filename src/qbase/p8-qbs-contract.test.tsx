import 'fake-indexeddb/auto';
import React, { useEffect } from 'react';
import {
    act,
    render,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { blank } from '@/core/testing/helpers';
import { shop } from '@/core/wire/fixtures/shop';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { databaseExists } from '@/persistence/database';
import { version1Rows, writeOldDatabase } from '@/persistence/test-support';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { ThemeProvider } from '@/platform/theme/theme-provider';
import { EditorStoreProvider } from '@/store/editor-provider';
import { createEditorStore } from '@/store/editor-store';
import { StoreContext } from '@/store/store-context';
import { cn, generateId } from '@/lib/utils';
import { DiagramProvider } from './diagram-provider';
import { diagramToDesign, designToDiagram } from './diagram-convert';
import { createRelationshipsFromMetadata } from './metadata-adapters';
import { StorageProvider } from './storage-provider';
import { useDiagram } from './use-diagram';
import { useFocusOn } from './use-focus-on';
import { useLayout } from './use-layout';
import { useStorage } from './use-storage';
import type { Diagram } from './diagram-types';

const dated = () => ({
    ...structuredClone(shop),
    createdAt: '2026-10-17T09:30:00.000Z',
    updatedAt: '2026-10-17T09:31:12.000Z',
});
const shopDesign = () => diagramToDesign(dated()).design;

describe('QBS-001 useDiagram offers the capabilities QBase code uses', () => {
    it('gives the diagram, tables, database type, read-only flag and the five edits', async () => {
        const design = shopDesign();
        const { result } = renderHook(() => useDiagram(), {
            wrapper: ({ children }) => (
                <EditorStoreProvider design={design}>
                    {children}
                </EditorStoreProvider>
            ),
        });
        const d = result.current;
        expect(d.currentDiagram.id).toBe(design.id);
        expect(d.tables.map((t) => t.name)).toContain('customers');
        expect(d.databaseType).toBe('postgresql');
        expect(d.readonly).toBe(false);
        for (const fn of [
            d.addIndex,
            d.removeIndex,
            d.updateField,
            d.updateTable,
            d.updateDiagramData,
        ])
            expect(fn).toBeTypeOf('function');
        await act(async () => {
            await d.updateTable('t1', { name: 'clients' });
        });
        expect(result.current.tables[0].name).toBe('clients');
    });
});

describe('QBS-002 an edit replaces only the section it changed', () => {
    it('hook: a table edit gives new tables, same relationships and notes, later updatedAt', async () => {
        const design = shopDesign();
        const { result } = renderHook(() => useDiagram(), {
            wrapper: ({ children }) => (
                <EditorStoreProvider design={design}>
                    {children}
                </EditorStoreProvider>
            ),
        });
        const before = result.current.currentDiagram;
        await act(async () => {
            await result.current.updateTable('t1', { name: 'clients' });
        });
        const after = result.current.currentDiagram;
        expect(after.tables).not.toBe(before.tables);
        expect(after.relationships).toBe(before.relationships);
        expect(after.areas).toBe(before.areas);
        expect(after.customTypes).toBe(before.customTypes);
        expect(after.updatedAt.getTime()).toBeGreaterThan(
            before.updatedAt.getTime()
        );
    });
});

const Probe: React.FC = () => {
    const { currentDiagram } = useDiagram();
    return <p data-testid="probe">{currentDiagram.name}</p>;
};

describe('QBS-003 while another diagram loads, nothing of the old one is shown', () => {
    it('the provider holds its children back, then opens the new diagram with its own store', async () => {
        const adapter = new MemoryStorageAdapter();
        const a = { ...blank(), id: 'dgA', name: 'Alpha' };
        const b = { ...blank(), id: 'dgB', name: 'Beta' };
        await adapter.save(a);
        await adapter.save(b);
        let release: () => void = () => {};
        const gate = new Promise<void>((r) => (release = r));
        const realLoad = adapter.load.bind(adapter);
        adapter.load = async (id: string) => {
            if (id === 'dgB') await gate;
            return realLoad(id);
        };
        const nav: { go: (to: string) => void } = { go: () => {} };
        const Nav: React.FC = () => {
            const navigate = useNavigate();
            useEffect(() => {
                nav.go = navigate;
            });
            return null;
        };
        const { StorageContext } = await import('./storage-context');
        const { localDiagramsOver } = await import('./local-diagrams');
        render(
            <MemoryRouter initialEntries={['/diagrams/dgA']}>
                <Nav />
                <StorageContext.Provider
                    value={{ adapter, diagrams: localDiagramsOver(adapter) }}
                >
                    <Routes>
                        <Route
                            path="/diagrams/:diagramId"
                            element={
                                <DiagramProvider>
                                    <Probe />
                                </DiagramProvider>
                            }
                        />
                    </Routes>
                </StorageContext.Provider>
            </MemoryRouter>
        );
        expect(await screen.findByTestId('probe')).toHaveTextContent('Alpha');
        act(() => nav.go('/diagrams/dgB'));
        await waitFor(() => expect(screen.queryByTestId('probe')).toBeNull());
        release();
        expect(await screen.findByTestId('probe')).toHaveTextContent('Beta');
    });
});

describe('QBS-004 read-only is a store flag: nothing is changed or stored', () => {
    it('DiagramProvider readonly refuses edits and writes nothing to storage', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save({ ...blank(), id: 'dgR', name: 'Fixed' });
        const save = vi.spyOn(adapter, 'save');
        const { StorageContext } = await import('./storage-context');
        const { localDiagramsOver } = await import('./local-diagrams');
        const held: { seen?: ReturnType<typeof useDiagram> } = {};
        const Grab: React.FC = () => {
            const value = useDiagram();
            useEffect(() => {
                held.seen = value;
            });
            return null;
        };
        render(
            <MemoryRouter initialEntries={['/diagrams/dgR']}>
                <StorageContext.Provider
                    value={{ adapter, diagrams: localDiagramsOver(adapter) }}
                >
                    <Routes>
                        <Route
                            path="/diagrams/:diagramId"
                            element={
                                <DiagramProvider readonly>
                                    <Grab />
                                </DiagramProvider>
                            }
                        />
                    </Routes>
                </StorageContext.Provider>
            </MemoryRouter>
        );
        await waitFor(() => expect(held.seen).toBeDefined());
        expect(held.seen!.readonly).toBe(true);
        await expect(
            held.seen!.updateTable('missing', { name: 'x' })
        ).rejects.toThrow();
        await new Promise((r) => setTimeout(r, 50));
        expect(save).not.toHaveBeenCalled();
    });
});

describe('QBS-005 the saved shape stays', () => {
    it('a diagram saved by the earlier editor survives a round trip with the same keys', () => {
        const diagram = designToDiagram(shopDesign());
        const json = JSON.parse(JSON.stringify(diagram));
        for (const key of [
            'id',
            'name',
            'databaseType',
            'tables',
            'relationships',
            'createdAt',
            'updatedAt',
        ])
            expect(json).toHaveProperty(key);
        const again = designToDiagram(diagramToDesign(json).design);
        expect(JSON.parse(JSON.stringify(again))).toEqual(json);
    });
});

describe('QBS-006 saved string values do not change', () => {
    it('database types, editions and field keys', async () => {
        const { DatabaseType, DatabaseEdition } =
            await import('./diagram-types');
        expect(Object.values(DatabaseType).sort()).toEqual(
            [
                'generic',
                'postgresql',
                'mysql',
                'sql_server',
                'mariadb',
                'sqlite',
                'clickhouse',
                'cockroachdb',
                'oracle',
            ].sort()
        );
        expect(Object.values(DatabaseEdition).sort()).toEqual(
            [
                'supabase',
                'timescale',
                'mysql_5_7',
                'sql_server_2016_and_below',
                'cloudflare_d1',
            ].sort()
        );
        const field = designToDiagram(shopDesign()).tables![0].fields[0];
        expect(Object.keys(field)).toEqual(
            expect.arrayContaining([
                'id',
                'name',
                'type',
                'primaryKey',
                'unique',
                'nullable',
            ])
        );
    });
});

describe('QBS-007 label, schema and type facts are provided', () => {
    it('labels every database type, lists the databases with schemas, and knows each database types', async () => {
        const { DatabaseType, databaseTypeToLabelMap, databasesWithSchemas } =
            await import('./diagram-types');
        const { knownTypes } = await import('./type-catalogue');
        for (const t of Object.values(DatabaseType))
            expect(databaseTypeToLabelMap[t], t).toBeTruthy();
        expect(databaseTypeToLabelMap.sql_server).toBe('SQL Server');
        expect(databasesWithSchemas).toEqual(
            expect.arrayContaining(['postgresql', 'sql_server', 'cockroachdb'])
        );
        expect(databasesWithSchemas).not.toContain('mysql');
        expect(knownTypes('postgresql').map((x) => x.name)).toContain(
            'integer'
        );
    });
});

describe('QBS-008 useStorage offers add, delete, list and get', () => {
    it('works over a given adapter, and also without the editor', async () => {
        const adapter = new MemoryStorageAdapter();
        const { result } = renderHook(() => useStorage(), {
            wrapper: ({ children }) => (
                <StorageProvider adapter={adapter}>{children}</StorageProvider>
            ),
        });
        await waitFor(() => expect(result.current).toBeDefined());
        const s = result.current;
        const diagram: Diagram = {
            ...designToDiagram(shopDesign()),
            id: 'dgS',
        };
        await s.addDiagram({ diagram });
        expect((await s.listDiagrams()).map((d) => d.id)).toEqual(['dgS']);
        expect((await s.getDiagram('dgS'))?.name).toBe(diagram.name);
        await s.deleteDiagram('dgS');
        expect(await s.getDiagram('dgS')).toBeUndefined();
    });

    it('refuses to be used outside the provider with a clear message', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => useStorage())).toThrow(/StorageProvider/);
        spy.mockRestore();
    });
});

describe('QBS-009 the storage provider opens QBase and moves the earlier QubdiDB', () => {
    it('lists the earlier database diagrams and removes QubdiDB', async () => {
        await writeOldDatabase({}, 'QubdiDB', 1, version1Rows);
        expect(await databaseExists('QubdiDB', {})).toBe(true);
        const { result } = renderHook(() => useStorage(), {
            wrapper: ({ children }) => (
                <StorageProvider>{children}</StorageProvider>
            ),
        });
        await waitFor(() => expect(result.current).not.toBeNull(), {
            timeout: 5000,
        });
        const list = await result.current.listDiagrams();
        expect(list.map((d) => d.id)).toContain('dg1');
        expect(await databaseExists('QubdiDB', {})).toBe(false);
        expect(await databaseExists('QBase', {})).toBe(true);
    });
});

describe('QBS-011 side panel and focus capabilities', () => {
    it('useLayout and useFocusOn drive the store', () => {
        const store = createEditorStore({ design: shopDesign() });
        store.getState().hidePanel();
        const { result } = renderHook(
            () => ({ layout: useLayout(), focus: useFocusOn() }),
            {
                wrapper: ({ children }) => (
                    <StoreContext.Provider value={store}>
                        {children}
                    </StoreContext.Provider>
                ),
            }
        );
        expect(result.current.layout.isSidePanelShowed).toBe(false);
        act(() => result.current.layout.openTableFromSidebar('t1'));
        expect(result.current.layout.isSidePanelShowed).toBe(true);
        act(() => result.current.focus.focusOnTable('t1'));
        expect(store.getState().ui.focus?.entityId).toBe('t1');
    });
});

describe('QBS-012 settings and theme open with defaults when storage throws', () => {
    it('ThemeProvider inside LocalConfigProvider renders its children', () => {
        const get = vi
            .spyOn(Storage.prototype, 'getItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });
        const set = vi
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });
        try {
            render(
                <LocalConfigProvider>
                    <ThemeProvider>
                        <p>opened</p>
                    </ThemeProvider>
                </LocalConfigProvider>
            );
            expect(screen.getByText('opened')).toBeInTheDocument();
        } finally {
            get.mockRestore();
            set.mockRestore();
        }
    });
});

describe('QBS-018 createRelationshipsFromMetadata', () => {
    it('makes one relationship per foreign key row between known tables, referenced side as source', () => {
        const tables = designToDiagram(shopDesign()).tables!;
        const orders = tables.find((t) => t.name === 'orders')!;
        const customers = tables.find((t) => t.name === 'customers')!;
        const fk = orders.fields.find((f) => f.name.includes('customer'));
        if (!fk) throw new Error('fixture has no customer column in orders');
        const rels = createRelationshipsFromMetadata({
            foreignKeys: [
                {
                    schema: orders.schema ?? '',
                    table: orders.name,
                    column: fk.name,
                    foreign_key_name: 'fk_x',
                    fk_def: '',
                    reference_schema: customers.schema ?? '',
                    reference_table: customers.name,
                    reference_column: customers.fields[0].name,
                } as never,
                {
                    schema: '',
                    table: 'ghost',
                    column: 'x',
                    foreign_key_name: 'fk_g',
                    fk_def: '',
                    reference_table: 'customers',
                    reference_column: 'id',
                } as never,
            ],
            tables,
        });
        expect(rels).toHaveLength(1);
        expect(rels[0].sourceTableId).toBe(customers.id);
        expect(rels[0].targetTableId).toBe(orders.id);
    });
});

describe('QBS-021 utilities at @/lib/utils', () => {
    it('cn merges class names and generateId gives distinct ids', () => {
        expect(cn('a', undefined, 'p-2', 'p-4')).toBe('a p-4');
        const ids = new Set(Array.from({ length: 50 }, () => generateId()));
        expect(ids.size).toBe(50);
        expect([...ids][0]).toMatch(/^[a-z0-9]{25}$/);
    });
});

describe('QBS-049 the editor keeps diagram data nowhere but the local database', () => {
    it('editing and saving writes the table names to storage adapter only, not to local or session storage', async () => {
        localStorage.clear();
        sessionStorage.clear();
        const adapter = new MemoryStorageAdapter();
        const save = vi.spyOn(adapter, 'save');
        const design = shopDesign();
        const { result } = renderHook(() => useDiagram(), {
            wrapper: ({ children }) => (
                <EditorStoreProvider
                    design={design}
                    adapter={adapter}
                    autosaveDelayMs={5}
                >
                    {children}
                </EditorStoreProvider>
            ),
        });
        await act(async () => {
            await result.current.updateTable('t1', { name: 'SentinelTable' });
        });
        await waitFor(() => expect(save).toHaveBeenCalled());
        const everything = [
            ...Object.keys(localStorage).map(
                (k) => `${k}=${localStorage.getItem(k)}`
            ),
            ...Object.keys(sessionStorage).map(
                (k) => `${k}=${sessionStorage.getItem(k)}`
            ),
        ].join('\n');
        expect(everything).not.toMatch(/Sentinel/);
    });
});
