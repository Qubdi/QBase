import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { listenClientConfig } from '../src/events.js';

describe('the LISTEN connection', () => {
    it('asks the OS to probe it while idle', () => {
        const client = new pg.Client(listenClientConfig('postgres://u:p@localhost:5432/db'));
        // pg turns the options into the socket's keepalive settings
        const params = (client as unknown as { connectionParameters: { keepalives?: number; keepalives_idle?: number } })
            .connectionParameters;
        expect(params.keepalives).toBe(1);
        expect(params.keepalives_idle).toBe(10);
    });

    it('keeps the connection string it was given', () => {
        const config = listenClientConfig('postgres://u:p@db.internal:5433/app');
        expect(config.connectionString).toBe('postgres://u:p@db.internal:5433/app');
    });
});
