import 'fake-indexeddb/auto';
import React, { useContext, useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { ApiError } from '@/lib/qubdi/api';
import { getRemoteId, setRemoteId } from '@/lib/qubdi/remote-map';
import { getBaseUpdatedAt, setBaseUpdatedAt } from '@/lib/qubdi/remote-version';
import type { Diagram } from '@/qbase/diagram-types';
import { qubdiContext, type QubdiContext } from '../qubdi-context';
import { QubdiProvider } from '../qubdi-provider';

vi.mock('@/lib/qubdi/config', () => ({
    QUBDI_BACKEND_URL: 'http://server.test',
    QUBDI_BACKEND_ENABLED: true,
}));

const api = vi.hoisted(() => ({
    me: vi.fn(),
    logout: vi.fn(),
    getDiagram: vi.fn(),
    updateDiagram: vi.fn(),
    createDiagram: vi.fn(),
}));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api,
}));
vi.mock('@/lib/qubdi/editor-id', () => ({ getEditorId: () => 'tab-9' }));

const diagram = {
    id: 'local-1',
    name: 'Shop',
    databaseType: 'postgresql',
    tables: [{ id: 'real-table-id', name: 'a', fields: [], indexes: [] }],
    relationships: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
} as unknown as Diagram;

const held: { ctx?: QubdiContext } = {};
const Grab: React.FC = () => {
    const value = useContext(qubdiContext);
    useEffect(() => {
        held.ctx = value;
    });
    return null;
};
const mount = async () => {
    render(
        <QubdiProvider>
            <Grab />
        </QubdiProvider>
    );
    await waitFor(() => expect(held.ctx!.user).toBeTruthy());
};

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    Object.values(api).forEach((m) => m.mockReset());
    api.me.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
});

describe('QBS-035 upload keeps ids, sends the base version and the editor id', () => {
    it('updates a bound diagram with the real ids, the conflict base and this tab', async () => {
        await mount();
        setRemoteId('local-1', 'remote-1');
        setBaseUpdatedAt('local-1', 'v7');
        api.updateDiagram.mockResolvedValue({
            id: 'remote-1',
            updatedAt: 'v8',
        });
        await act(async () => {
            await held.ctx!.syncDiagram(diagram);
        });
        const [id, body] = api.updateDiagram.mock.calls[0];
        expect(id).toBe('remote-1');
        expect(body).toMatchObject({
            title: 'Shop',
            baseUpdatedAt: 'v7',
            editorId: 'tab-9',
        });
        expect(body.content.tables[0].id).toBe('real-table-id');
        expect(getBaseUpdatedAt('local-1')).toBe('v8');
    });

    it('re-creates a diagram missing on the server only when a project is known', async () => {
        await mount();
        setRemoteId('local-1', 'gone');
        setBaseUpdatedAt('local-1', 'v1');
        api.updateDiagram.mockRejectedValue(new ApiError(404, 'not_found'));
        api.createDiagram.mockResolvedValue({ id: 'fresh', updatedAt: 'v1' });
        await act(async () => {
            expect(await held.ctx!.syncDiagram(diagram, 'p1')).toBe('fresh');
        });
        expect(api.createDiagram).toHaveBeenCalledWith(
            'Shop',
            expect.anything(),
            'p1'
        );
        expect(getRemoteId('local-1')).toBe('fresh');
    });

    it('without a project the 404 surfaces and the remote id is kept', async () => {
        await mount();
        setRemoteId('local-1', 'gone');
        setBaseUpdatedAt('local-1', 'v1');
        api.updateDiagram.mockRejectedValue(new ApiError(404, 'not_found'));
        await act(async () => {
            await expect(held.ctx!.syncDiagram(diagram)).rejects.toMatchObject({
                status: 404,
            });
        });
        expect(api.createDiagram).not.toHaveBeenCalled();
        expect(getRemoteId('local-1')).toBe('gone');
    });

    it('a diagram not on the server cannot be created without a project', async () => {
        await mount();
        await act(async () => {
            await expect(held.ctx!.syncDiagram(diagram)).rejects.toMatchObject({
                code: 'no_project',
            });
        });
    });
});

describe('QBS-048 signing out deletes the local databases and qbase.* keys, keeps interface settings', () => {
    it('removes QBase and QubdiDB, the qbase keys, then leaves the page', async () => {
        for (const name of ['QBase', 'QubdiDB']) {
            const db = new Dexie(name);
            db.version(1).stores({ rows: 'id' });
            await db.open();
            db.close();
        }
        localStorage.setItem('qbase.remote-map', '{}');
        localStorage.setItem('theme', 'dark');
        sessionStorage.setItem('qbase.sent-content', '{}');
        api.logout.mockResolvedValue(undefined);
        const replace = vi.fn();
        const real = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...real, replace, reload: vi.fn() },
        });
        try {
            await mount();
            await act(async () => {
                await held.ctx!.logout();
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: real,
            });
        }
        expect(await Dexie.exists('QBase')).toBe(false);
        expect(await Dexie.exists('QubdiDB')).toBe(false);
        expect(localStorage.getItem('qbase.remote-map')).toBeNull();
        expect(sessionStorage.getItem('qbase.sent-content')).toBeNull();
        expect(localStorage.getItem('theme')).toBe('dark');
        expect(replace).toHaveBeenCalledWith('/');
    });

    it('a different person signing in clears the earlier copies and reloads', async () => {
        const db = new Dexie('QBase');
        db.version(1).stores({ rows: 'id' });
        await db.open();
        db.close();
        localStorage.setItem('qbase.local-owner', 'someone-else');
        localStorage.setItem('qbase.remote-map', '{"x":"y"}');
        const reload = vi.fn();
        const real = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...real, reload, replace: vi.fn() },
        });
        try {
            render(
                <QubdiProvider>
                    <Grab />
                </QubdiProvider>
            );
            await waitFor(() => expect(reload).toHaveBeenCalled());
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: real,
            });
        }
        expect(await Dexie.exists('QBase')).toBe(false);
        expect(localStorage.getItem('qbase.remote-map')).toBeNull();
        expect(localStorage.getItem('qbase.local-owner')).toBe('u1');
    });
});
