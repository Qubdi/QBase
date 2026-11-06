import React from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareViewerPage } from '../share-viewer-page';

const getPublicShare = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { getPublicShare: (...a: unknown[]) => getPublicShare(...a) },
}));
vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ user: null }),
}));
vi.mock('@xyflow/react', () => ({
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Panel: () => null,
    ReactFlow: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
}));
vi.mock('@xyflow/react/dist/style.css', () => ({}));

class FakeEventSource {
    static CLOSED = 2;
    static instances: FakeEventSource[] = [];
    readyState = 0;
    closed = false;
    listeners = new Map<string, Array<() => void>>();
    constructor(public url: string) {
        FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, fn: () => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    emit(type: string) {
        this.listeners.get(type)?.forEach((fn) => fn());
    }
    close() {
        this.closed = true;
        this.readyState = FakeEventSource.CLOSED;
    }
}

const share = (version: number) => ({
    status: 'ok',
    share: {
        title: 'Shop',
        content: { tables: [], relationships: [] },
        version,
        publishedAt: '2026-01-01T00:00:00.000Z',
        live: true,
    },
});

const show = async () => {
    let view!: ReturnType<typeof render>;
    await act(async () => {
        view = render(
            <MemoryRouter initialEntries={['/s/tok']}>
                <Routes>
                    <Route path="/s/:token" element={<ShareViewerPage />} />
                </Routes>
            </MemoryRouter>
        );
    });
    return view;
};

describe('ShareViewerPage live stream', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        FakeEventSource.instances = [];
        vi.stubGlobal('EventSource', FakeEventSource);
        getPublicShare.mockReset().mockResolvedValue(share(1));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('opens a new stream after the server refused one, then catches up', async () => {
        await show();
        expect(FakeEventSource.instances).toHaveLength(1);
        const first = FakeEventSource.instances[0];
        // an error reply such as 429: the browser closes the stream for good
        first.readyState = FakeEventSource.CLOSED;
        act(() => first.emit('error'));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_000);
        });
        expect(FakeEventSource.instances).toHaveLength(2);
        expect(getPublicShare).toHaveBeenCalledTimes(1);
        // once the new stream is up, a version published in the gap is fetched
        getPublicShare.mockResolvedValue(share(2));
        await act(async () => FakeEventSource.instances[1].emit('open'));
        expect(getPublicShare).toHaveBeenCalledTimes(2);
    });

    it('lets the browser reconnect a dropped stream by itself', async () => {
        await show();
        const first = FakeEventSource.instances[0];
        // still connecting: the browser retries on its own
        first.readyState = 0;
        act(() => first.emit('error'));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5_000);
        });
        expect(FakeEventSource.instances).toHaveLength(1);
        await act(async () => first.emit('open'));
        expect(getPublicShare).toHaveBeenCalledTimes(2);
    });

    it('stops retrying once the page is left', async () => {
        const view = await show();
        const first = FakeEventSource.instances[0];
        first.readyState = FakeEventSource.CLOSED;
        act(() => first.emit('error'));
        view.unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(FakeEventSource.instances).toHaveLength(1);
    });
});

describe('ShareViewerPage reloads', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        FakeEventSource.instances = [];
        vi.stubGlobal('EventSource', FakeEventSource);
        getPublicShare.mockReset().mockResolvedValue(share(1));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const titled = (title: string, version: number) => {
        const r = share(version);
        return { ...r, share: { ...r.share, title } };
    };

    it('keeps the newest version when an older reload answers last', async () => {
        const view = await show();
        const stream = FakeEventSource.instances[0];
        let answerOld!: (v: unknown) => void;
        let answerNew!: (v: unknown) => void;
        getPublicShare
            .mockReturnValueOnce(new Promise((r) => (answerOld = r)))
            .mockReturnValueOnce(new Promise((r) => (answerNew = r)));
        act(() => stream.emit('version'));
        act(() => stream.emit('version'));

        await act(async () => answerNew(titled('Version 3', 3)));
        expect(view.getByTestId('viewer-title').textContent).toBe('Version 3');
        await act(async () => answerOld(titled('Version 2', 2)));
        expect(view.getByTestId('viewer-title').textContent).toBe('Version 3');
    });
});
