import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import postgresSample from '@/lib/qubdi/__tests__/fixtures/postgres-sample.json';
import { metadataToDiagram } from '@/lib/qubdi/import-from-db';
import { snapshotSourceKeys } from '@/lib/qubdi/resync';
import { getSyncState, setSyncState } from '@/lib/qubdi/sync-state';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { designToDiagram, diagramToDesign } from '@/qbase/diagram-convert';
import { createEditorStore } from '@/store/editor-store';
import { StoreContext } from '@/store/store-context';
import { Toaster } from '@/platform/toast/toaster';
import { resetToasts } from '@/platform/toast/use-toast';
import { ResyncDialog } from '../resync-dialog';

const introspect = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { introspect: (...a: unknown[]) => introspect(...a) },
}));

const base = postgresSample as unknown as DatabaseMetadata;
const clone = (): DatabaseMetadata => structuredClone(base);

type Setup = Awaited<ReturnType<typeof setup>>;
const setup = async () => {
    const diagram = await metadataToDiagram('postgresql', base, 'x');
    const store = createEditorStore({
        design: diagramToDesign(diagram).design,
    });
    const id = store.getState().design.id;
    setSyncState(id, {
        dialect: 'postgresql',
        source: { kind: 'saved', savedConnectionId: 'c1' },
        tables: [],
        schemas: [],
        sourceKeys: snapshotSourceKeys(diagram, base, {
            tables: {},
            columns: {},
        }),
        lastSyncedAt: new Date(0).toISOString(),
    });
    const syncDiagram = vi.fn(async () => 'r1');
    render(
        <StoreContext.Provider value={store}>
            <qubdiContext.Provider
                value={
                    {
                        enabled: true,
                        syncDiagram,
                        remoteIdFor: () => 'r1',
                    } as unknown as QubdiContext
                }
            >
                <ResyncDialog open onOpenChange={() => undefined} />
                <Toaster />
            </qubdiContext.Provider>
        </StoreContext.Provider>
    );
    return { store, id, syncDiagram };
};

const diagramOf = (s: Setup) => designToDiagram(s.store.getState().design);

beforeEach(() => {
    localStorage.clear();
    resetToasts();
    introspect.mockReset();
});

const check = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Check for changes' }));

describe('QBS-044 re-sync compares the live database with the diagram and applies chosen changes', () => {
    it('says so when nothing differs', async () => {
        await setup();
        introspect.mockResolvedValue({ metadata: clone() });
        check();
        expect(await screen.findByTestId('resync-clean')).toBeInTheDocument();
    });

    it('shows grouped changes, all checked, and applies them as one undo step that also updates keys and server copy', async () => {
        const s = await setup();
        const live = clone();
        live.columns.push({
            ...live.columns.find((c) => c.table === 'orders')!,
            name: 'extra_a',
            type: 'text',
            ordinal_position: 99,
            is_identity: false,
            default: null,
        });
        introspect.mockResolvedValue({ metadata: live });
        const before = diagramOf(s);
        check();
        const list = await screen.findByTestId('resync-changes');
        const boxes = list.querySelectorAll<HTMLInputElement>(
            'input[type=checkbox]'
        );
        expect(boxes.length).toBeGreaterThan(0);
        for (const b of boxes) expect(b.checked).toBe(true);
        expect(list.querySelectorAll('fieldset').length).toBeGreaterThan(0);
        fireEvent.click(
            screen.getByRole('button', { name: /^Apply 1 selected/ })
        );
        await waitFor(() =>
            expect(
                diagramOf(s)
                    .tables!.find((t) => t.name === 'orders')!
                    .fields.some((f) => f.name === 'extra_a')
            ).toBe(true)
        );
        // one undo step for the whole re-sync
        expect(s.store.getState().history.undo).toHaveLength(1);
        // the server copy follows
        await waitFor(() => expect(s.syncDiagram).toHaveBeenCalledTimes(1));
        // the remembered source keys now know the new column
        const keys = getSyncState(s.id)!.sourceKeys.columns;
        expect(Object.values(keys)).toContain('extra_a');
        expect(getSyncState(s.id)!.lastSyncedAt).not.toBe(
            new Date(0).toISOString()
        );
        // undo brings the old diagram back in one step
        act(() => s.store.getState().undo());
        expect(
            diagramOf(s)
                .tables!.find((t) => t.name === 'orders')!
                .fields.map((f) => f.name)
        ).toEqual(
            before
                .tables!.find((t) => t.name === 'orders')!
                .fields.map((f) => f.name)
        );
    });

    it('applies only the ticked changes', async () => {
        const s = await setup();
        const live = clone();
        for (const name of ['extra_a', 'extra_b'])
            live.columns.push({
                ...live.columns.find((c) => c.table === 'orders')!,
                name,
                type: 'text',
                ordinal_position: 90,
                is_identity: false,
                default: null,
            });
        introspect.mockResolvedValue({ metadata: live });
        check();
        const list = await screen.findByTestId('resync-changes');
        const boxes = [
            ...list.querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
        ];
        expect(boxes).toHaveLength(2);
        fireEvent.click(boxes[1]);
        fireEvent.click(
            screen.getByRole('button', { name: /^Apply 1 selected/ })
        );
        await waitFor(() =>
            expect(s.store.getState().history.undo).toHaveLength(1)
        );
        const names = diagramOf(s)
            .tables!.find((t) => t.name === 'orders')!
            .fields.map((f) => f.name);
        expect(
            names.filter((n) => n === 'extra_a' || n === 'extra_b')
        ).toHaveLength(1);
    });

    it('a renamed column is offered as a rename that is not ticked', async () => {
        await setup();
        const live = clone();
        const col = live.columns.find(
            (c) => c.table === 'orders' && c.name === 'status'
        )!;
        col.name = 'state';
        introspect.mockResolvedValue({ metadata: live });
        check();
        const list = await screen.findByTestId('resync-changes');
        const renames = [...list.querySelectorAll('fieldset')].find((f) =>
            /Possible renames/i.test(f.textContent ?? '')
        );
        expect(renames).toBeTruthy();
        const box = renames!.querySelector<HTMLInputElement>(
            'input[type=checkbox]'
        )!;
        expect(box.checked).toBe(false);
    });
});
