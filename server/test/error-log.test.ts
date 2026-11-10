import { Writable } from 'node:stream';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/client.js';
import { safeError } from '../src/lib/safe-error.js';
import { TEST_URL } from './helpers.js';

const SECRET = 'SECRET-PARAM-9f3a7c';

const queryError = () => {
    const driver = Object.assign(
        new Error(`invalid input syntax for type uuid: "${SECRET}"`),
        {
            code: '22P02',
            detail: `Key (email)=(${SECRET}) already exists.`,
            constraint: 'users_email_key',
        }
    );
    return new DrizzleQueryError('select "id" from "users" where "email" = $1', [SECRET], driver);
};

describe('safeError', () => {
    it('keeps the kind of failure and none of the values', () => {
        const out = safeError(queryError());
        const text = JSON.stringify(out);
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain('select "id"');
        expect(out.name).toBe('Error');
        expect(out.cause).toMatchObject({ code: '22P02', constraint: 'users_email_key' });
        expect(out.message).toContain('22P02');
    });

    it('keeps an ordinary error as it is, with its frames', () => {
        const out = safeError(new TypeError('x is not a function'));
        expect(out.name).toBe('TypeError');
        expect(out.message).toBe('x is not a function');
        expect(out.stack).toContain('at ');
        expect(out.stack).not.toContain('x is not a function');
    });

    it('says something for a value that is not an Error', () => {
        expect(safeError('boom').name).toBe('NonError');
    });
});

describe('the error handler', () => {
    const lines: string[] = [];
    const stream = new Writable({
        write(chunk, _enc, done) {
            lines.push(String(chunk));
            done();
        },
    });
    const { db, pool } = createDb(TEST_URL);
    // a database that fails the way Drizzle reports a failed query
    const failing = new Proxy(db, {
        get(target, prop, receiver) {
            if (prop === 'select') {
                return () => {
                    throw queryError();
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });
    afterAll(() => pool.end());

    it('does not write the query values of a failed request to the log', async () => {
        const config = {
            ...loadConfig({ DATABASE_URL: TEST_URL, LOG_LEVEL: 'error' }),
            databaseUrl: TEST_URL,
        };
        const app = buildApp({ config, db: failing, logStream: stream });
        await app.ready();
        const res = await app.inject({
            url: '/projects',
            headers: { cookie: 'qbase_session=anything' },
        });
        await app.close();
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual({ error: 'internal_error' });
        const log = lines.join('');
        expect(log).toContain('request failed');
        expect(log).toContain('22P02');
        expect(log).not.toContain(SECRET);
        expect(log).not.toContain('select \\"id\\"');
    });
});
