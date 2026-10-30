import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/events.js';
import { TEST_URL } from './helpers.js';

// Two buses stand for two replicas of the server sharing one database.
describe('events between replicas', () => {
    let pool: pg.Pool;
    const stops: Array<() => Promise<void>> = [];

    beforeAll(() => {
        pool = new pg.Pool({ connectionString: TEST_URL, max: 2 });
    });
    afterAll(async () => {
        await Promise.all(stops.map((stop) => stop()));
        await pool.end();
    });

    const replica = async () => {
        const bus = createEventBus();
        stops.push(
            await bus.startBridge({
                databaseUrl: TEST_URL,
                notify: (channel, payload) =>
                    pool.query('select pg_notify($1, $2)', [channel, payload]),
                retryMs: 50,
            })
        );
        return bus;
    };

    it('delivers a publish to the other replica, and once to its own', async () => {
        const a = await replica();
        const b = await replica();
        const onA = vi.fn();
        const onB = vi.fn();
        a.onPublish(onA);
        b.onPublish(onB);

        a.emitPublish('diagram-1', 4);

        await vi.waitFor(() =>
            expect(onB).toHaveBeenCalledWith('diagram-1', 4)
        );
        // give a stray echo time to arrive
        await new Promise((r) => setTimeout(r, 100));
        expect(onA).toHaveBeenCalledTimes(1);
        expect(onB).toHaveBeenCalledTimes(1);
    });

    it('delivers a link change to the other replica', async () => {
        const a = await replica();
        const b = await replica();
        const onB = vi.fn();
        b.onLinkChanged(onB);
        a.emitLinkChanged('link-9');
        await vi.waitFor(() => expect(onB).toHaveBeenCalledWith('link-9'));
    });

    it('stays inside one process without a bridge', () => {
        const bus = createEventBus();
        const seen = vi.fn();
        const off = bus.onPublish(seen);
        bus.emitPublish('d', 1);
        off();
        bus.emitPublish('d', 2);
        expect(seen.mock.calls).toEqual([['d', 1]]);
    });

    it('ignores a payload that is not one of its messages', async () => {
        const a = await replica();
        const seen = vi.fn();
        a.onPublish(seen);
        await pool.query("select pg_notify('qubdi_events', 'not json')");
        await pool.query(
            `select pg_notify('qubdi_events', '{"o":"x","t":"nope"}')`
        );
        await new Promise((r) => setTimeout(r, 100));
        expect(seen).not.toHaveBeenCalled();
    });

    it('listens again after its connection was cut', async () => {
        const a = await replica();
        const b = await replica();
        const onB = vi.fn();
        b.onPublish(onB);

        // end every listening connection from the server side
        await pool.query(
            `select pg_terminate_backend(pid) from pg_stat_activity
             where query = 'LISTEN qubdi_events' and pid <> pg_backend_pid()`
        );
        await vi.waitFor(
            async () => {
                a.emitPublish('after', 1);
                await new Promise((r) => setTimeout(r, 60));
                expect(onB).toHaveBeenCalledWith('after', 1);
            },
            { timeout: 5_000, interval: 100 }
        );
    });
});
