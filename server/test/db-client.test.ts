import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { TEST_URL } from './helpers.js';

describe('createDb statement timeout', () => {
    const pools: Array<{ end: () => Promise<void> }> = [];
    afterEach(async () => {
        await Promise.all(pools.splice(0).map((p) => p.end()));
    });
    const open = (options: Parameters<typeof createDb>[1]) => {
        const made = createDb(TEST_URL, options);
        pools.push(made.pool);
        return made.pool;
    };

    it('cancels a statement that runs past the limit', async () => {
        const pool = open({ statementTimeoutMs: 300 });
        await expect(pool.query('select pg_sleep(3)')).rejects.toThrow(
            /statement timeout/
        );
        // the connection is still good afterwards
        expect((await pool.query('select 1 as n')).rows[0].n).toBe(1);
    });

    it('lets a statement under the limit finish', async () => {
        const pool = open({ statementTimeoutMs: 2000 });
        await expect(pool.query('select pg_sleep(0.05)')).resolves.toBeTruthy();
    });

    it('has no limit when none is given, or when it is 0', async () => {
        for (const options of [{}, { statementTimeoutMs: 0 }]) {
            const pool = open(options);
            const { rows } = await pool.query('show statement_timeout');
            expect(rows[0].statement_timeout).toBe('0');
        }
    });
});
