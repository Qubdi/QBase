import type { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

// A fake pg.Client whose notifications the test sends by hand, so no database is needed.
const fake = vi.hoisted(() => ({ clients: [] as unknown[] }));
vi.mock('pg', async () => {
    const { EventEmitter } = await import('node:events');
    class Client extends EventEmitter {
        constructor() {
            super();
            fake.clients.push(this);
        }
        connect = async () => undefined;
        query = async () => undefined;
        end = async () => undefined;
    }
    return { default: { Client } };
});

const { createEventBus, EVENTS_CHANNEL } = await import('../src/events.js');

describe('a notification that is not a wire message', () => {
    it('is ignored; only real messages from another replica are delivered', async () => {
        const bus = createEventBus();
        const stop = await bus.startBridge({
            databaseUrl: 'postgres://unused',
            notify: async () => undefined,
            retryMs: 10_000,
        });
        const client = fake.clients[0] as EventEmitter;
        const onPublish = vi.fn();
        const onLink = vi.fn();
        bus.onPublish(onPublish);
        bus.onLinkChanged(onLink);
        const send = (payload: string) =>
            client.emit('notification', { channel: EVENTS_CHANNEL, payload });

        for (const junk of ['null', '7', '"text"', 'true', '[]', '{', '{}']) {
            expect(() => send(junk)).not.toThrow();
        }
        expect(onPublish).not.toHaveBeenCalled();
        expect(onLink).not.toHaveBeenCalled();

        send(JSON.stringify({ o: 'other', t: 'publish', d: 'd1', v: 3 }));
        send(JSON.stringify({ o: 'other', t: 'link', l: 'l1' }));
        expect(onPublish).toHaveBeenCalledWith('d1', 3);
        expect(onLink).toHaveBeenCalledWith('l1');
        await stop();
    });
});

describe('lock events between replicas', () => {
    const poke = {
        kind: 'poke',
        diagramId: 'd1',
        toUser: 'u1',
        toEditor: 'tab-1',
        pokeId: 'p1',
        from: 'b@example.com',
        expiresAt: '2026-01-01T00:00:00.000Z',
    } as const;
    const result = {
        kind: 'poke-result',
        diagramId: 'd1',
        toUser: 'u2',
        toEditor: 'tab-2',
        pokeId: 'p1',
        outcome: 'left',
    } as const;

    it('reaches this process at once and every other replica through the database', async () => {
        const sent: string[] = [];
        const bus = createEventBus();
        const stop = await bus.startBridge({
            databaseUrl: 'postgres://unused',
            notify: async (_channel, payload) => void sent.push(payload),
            retryMs: 10_000,
        });
        const here = vi.fn();
        bus.onLockEvent(here);
        bus.emitLockEvent(poke);
        expect(here).toHaveBeenCalledExactlyOnceWith(poke);
        expect(sent.map((p) => JSON.parse(p))).toEqual([
            expect.objectContaining({ t: 'lock', e: poke }),
        ]);
        await stop();
    });

    it('is delivered from another replica, but only when it is well formed', async () => {
        const bus = createEventBus();
        const stop = await bus.startBridge({
            databaseUrl: 'postgres://unused',
            notify: async () => undefined,
            retryMs: 10_000,
        });
        const client = fake.clients.at(-1) as EventEmitter;
        const heard = vi.fn();
        bus.onLockEvent(heard);
        const send = (e: unknown, o = 'other') =>
            client.emit('notification', {
                channel: EVENTS_CHANNEL,
                payload: JSON.stringify({ o, t: 'lock', e }),
            });

        send(poke);
        send(result);
        expect(heard.mock.calls.map((c) => c[0])).toEqual([poke, result]);

        heard.mockClear();
        // not an event, missing parts, or a kind or answer nobody sends
        for (const junk of [
            null,
            7,
            'poke',
            {},
            { ...poke, kind: 'other' },
            { ...poke, from: undefined },
            { ...poke, expiresAt: 5 },
            { ...result, outcome: 'maybe' },
            { ...result, toEditor: undefined },
        ]) {
            expect(() => send(junk)).not.toThrow();
        }
        // a well formed one from yet another replica still gets through
        send(poke, 'a-third-replica');
        expect(heard).toHaveBeenCalledTimes(1);
        await stop();
    });
});
