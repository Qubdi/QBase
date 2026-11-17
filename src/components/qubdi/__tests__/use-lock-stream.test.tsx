import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    RECONNECT_MAX_MS,
    RECONNECT_MIN_MS,
    useLockStream,
} from '../use-lock-stream';

vi.mock('@/lib/qubdi/api', () => ({
    api: {
        lockEventsUrl: (id: string, editorId: string) =>
            `http://srv/diagrams/${id}/lock/events?editorId=${editorId}`,
    },
}));
vi.mock('@/lib/qubdi/editor-id', () => ({ getEditorId: () => 'tab-1' }));

class FakeEventSource {
    static CLOSED = 2;
    static instances: FakeEventSource[] = [];
    readyState = 0;
    closed = false;
    listeners = new Map<string, Array<(e: { data?: string }) => void>>();
    constructor(
        public url: string,
        public init?: EventSourceInit
    ) {
        FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, fn: (e: { data?: string }) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    }
    emit(type: string, data?: unknown) {
        const text = typeof data === 'string' ? data : JSON.stringify(data);
        this.listeners.get(type)?.forEach((fn) => fn({ data: text }));
    }
    close() {
        this.closed = true;
        this.readyState = FakeEventSource.CLOSED;
    }
}

const last = () => FakeEventSource.instances.at(-1)!;
const poke = { pokeId: 'p1', from: 'sam@corp.io', waitSeconds: 60 };

describe('useLockStream', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        FakeEventSource.instances = [];
        vi.stubGlobal('EventSource', FakeEventSource);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('listens to the stream of this editor on this diagram, signed in', () => {
        renderHook(() => useLockStream('r1'));
        expect(FakeEventSource.instances).toHaveLength(1);
        expect(last().url).toBe(
            'http://srv/diagrams/r1/lock/events?editorId=tab-1'
        );
        expect(last().init).toEqual({ withCredentials: true });
    });

    it('opens nothing without a server diagram, or where there is no EventSource', () => {
        renderHook(() => useLockStream(undefined));
        expect(FakeEventSource.instances).toHaveLength(0);

        vi.stubGlobal('EventSource', undefined);
        const { result } = renderHook(() => useLockStream('r1'));
        expect(result.current.incoming).toBeNull();
        expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('closes the stream when the editor leaves', () => {
        const { unmount } = renderHook(() => useLockStream('r1'));
        const stream = last();
        unmount();
        expect(stream.closed).toBe(true);
    });

    it('starts clean on another diagram, with a stream of its own', () => {
        const { result, rerender } = renderHook(({ id }) => useLockStream(id), {
            initialProps: { id: 'r1' },
        });
        const first = last();
        act(() => first.emit('poke', poke));
        expect(result.current.incoming).toEqual({
            pokeId: 'p1',
            from: 'sam@corp.io',
        });

        rerender({ id: 'r2' });
        expect(result.current.incoming).toBeNull();
        expect(result.current.result).toBeNull();
        expect(first.closed).toBe(true);
        expect(last().url).toContain('/diagrams/r2/');
    });

    describe('a request to step out', () => {
        it('shows who asks', () => {
            const { result } = renderHook(() => useLockStream('r1'));
            expect(result.current.incoming).toBeNull();
            act(() => last().emit('poke', poke));
            expect(result.current.incoming).toEqual({
                pokeId: 'p1',
                from: 'sam@corp.io',
            });
        });

        it('stops showing it when the time to answer is up, counted from when it came', () => {
            const { result } = renderHook(() => useLockStream('r1'));
            act(() => last().emit('poke', { ...poke, waitSeconds: 45 }));
            act(() => void vi.advanceTimersByTime(44_000));
            expect(result.current.incoming).not.toBeNull();
            act(() => void vi.advanceTimersByTime(1_000));
            expect(result.current.incoming).toBeNull();
        });

        it('lets the answer dismiss it, and only that request', () => {
            const { result } = renderHook(() => useLockStream('r1'));
            act(() => last().emit('poke', poke));
            act(() => result.current.dismiss('another'));
            expect(result.current.incoming).not.toBeNull();
            act(() => result.current.dismiss('p1'));
            expect(result.current.incoming).toBeNull();
        });

        it('shows a newer request in place of an older one, with a fresh time', () => {
            const { result } = renderHook(() => useLockStream('r1'));
            act(() => last().emit('poke', { ...poke, waitSeconds: 10 }));
            act(() =>
                last().emit('poke', {
                    pokeId: 'p2',
                    from: 'kim@corp.io',
                    waitSeconds: 60,
                })
            );
            // the first one's timer must not take the second one away
            act(() => void vi.advanceTimersByTime(20_000));
            expect(result.current.incoming).toEqual({
                pokeId: 'p2',
                from: 'kim@corp.io',
            });
        });
    });

    describe('how a request this editor made ended', () => {
        it.each(['accepted', 'declined', 'left'] as const)(
            'reports %s',
            (outcome) => {
                const { result } = renderHook(() => useLockStream('r1'));
                act(() =>
                    last().emit('poke-result', { pokeId: 'p1', outcome })
                );
                expect(result.current.result).toEqual({
                    pokeId: 'p1',
                    outcome,
                });
            }
        );
    });

    it('ignores what the server never sends', () => {
        const { result } = renderHook(() => useLockStream('r1'));
        const stream = last();
        act(() => {
            stream.emit('poke', 'not json');
            stream.emit('poke', { pokeId: 'p1' }); // no one asking
            stream.emit('poke', { ...poke, waitSeconds: 'soon' });
            stream.emit('poke-result', { pokeId: 'p1', outcome: 'maybe' });
            stream.emit('poke-result', { outcome: 'accepted' });
        });
        expect(result.current.incoming).toBeNull();
        expect(result.current.result).toBeNull();
    });

    describe('when the connection drops', () => {
        it('leaves a dropped stream to the browser, which reconnects by itself', () => {
            renderHook(() => useLockStream('r1'));
            last().readyState = 0; // reconnecting, not closed
            act(() => last().emit('error'));
            act(() => void vi.advanceTimersByTime(RECONNECT_MAX_MS));
            expect(FakeEventSource.instances).toHaveLength(1);
        });

        it('opens a new stream after one the browser gave up on, waiting longer each time', () => {
            renderHook(() => useLockStream('r1'));
            const fail = () => {
                const stream = last();
                stream.readyState = FakeEventSource.CLOSED;
                act(() => stream.emit('error'));
            };

            fail();
            act(() => void vi.advanceTimersByTime(RECONNECT_MIN_MS - 1));
            expect(FakeEventSource.instances).toHaveLength(1);
            act(() => void vi.advanceTimersByTime(1));
            expect(FakeEventSource.instances).toHaveLength(2);

            fail();
            act(() => void vi.advanceTimersByTime(RECONNECT_MIN_MS * 2 - 1));
            expect(FakeEventSource.instances).toHaveLength(2);
            act(() => void vi.advanceTimersByTime(1));
            expect(FakeEventSource.instances).toHaveLength(3);

            // a stream that opens again starts the wait over
            act(() => last().emit('open'));
            fail();
            act(() => void vi.advanceTimersByTime(RECONNECT_MIN_MS));
            expect(FakeEventSource.instances).toHaveLength(4);
        });

        it('never waits more than the longest wait', () => {
            renderHook(() => useLockStream('r1'));
            for (let i = 0; i < 12; i++) {
                last().readyState = FakeEventSource.CLOSED;
                act(() => last().emit('error'));
                act(() => void vi.advanceTimersByTime(RECONNECT_MAX_MS));
            }
            const before = FakeEventSource.instances.length;
            last().readyState = FakeEventSource.CLOSED;
            act(() => last().emit('error'));
            act(() => void vi.advanceTimersByTime(RECONNECT_MAX_MS));
            expect(FakeEventSource.instances).toHaveLength(before + 1);
        });

        it('stops trying once the editor has left', () => {
            const { unmount } = renderHook(() => useLockStream('r1'));
            last().readyState = FakeEventSource.CLOSED;
            act(() => last().emit('error'));
            unmount();
            act(() => void vi.advanceTimersByTime(RECONNECT_MAX_MS));
            expect(FakeEventSource.instances).toHaveLength(1);
        });
    });
});
