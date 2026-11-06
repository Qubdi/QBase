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
