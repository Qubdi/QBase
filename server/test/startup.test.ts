import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Config } from '../src/config.js';
import { loadConfig } from '../src/config.js';
import { driftSettings } from '../src/db/schema.js';
import { runStartupTasks, type StartupLog } from '../src/startup.js';
import { createDiagram, createTestApp, registerUser, TEST_URL, type TestCtx } from './helpers.js';

const SECRETS_KEY = 'a-secrets-key-of-32-characters-yes';

const configWith = (env: NodeJS.ProcessEnv = {}): Config =>
    loadConfig({ DATABASE_URL: TEST_URL, LOG_LEVEL: 'silent', ...env });

const fakeLog = () => {
    const lines = { log: [] as string[], warn: [] as string[], error: [] as string[] };
    const out: StartupLog = {
        log: (m) => void lines.log.push(m),
        warn: (m) => void lines.warn.push(m),
        error: (m, d) => void lines.error.push(d === undefined ? m : `${m} ${String(d)}`),
    };
    return { out, lines };
};

describe('start-up tasks', () => {
    let ctx: TestCtx;

    // a fresh, empty server for each test
    beforeEach(async () => {
        ctx = await createTestApp();
    });
    afterEach(() => ctx.close());

    describe('the first-run setup token', () => {
        it('is made and printed once on an empty server with no SETUP_TOKEN', async () => {
            const { out, lines } = fakeLog();
            const config = await runStartupTasks(ctx.db, configWith(), out);
            expect(config.setupToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
            expect(lines.log.join('\n')).toContain(`needs this setup token: ${config.setupToken}`);
        });

        it('makes a different token each time', async () => {
            const a = await runStartupTasks(ctx.db, configWith(), fakeLog().out);
            const b = await runStartupTasks(ctx.db, configWith(), fakeLog().out);
            expect(a.setupToken).not.toBe(b.setupToken);
        });

        it('keeps the SETUP_TOKEN the operator set and does not print it', async () => {
            const { out, lines } = fakeLog();
            const config = await runStartupTasks(ctx.db, configWith({ SETUP_TOKEN: 'chosen-by-the-operator' }), out);
            expect(config.setupToken).toBe('chosen-by-the-operator');
            const printed = lines.log.join('\n');
            expect(printed).toContain('the SETUP_TOKEN you set');
            expect(printed).not.toContain('chosen-by-the-operator');
        });

        it('does nothing once an account exists', async () => {
            await registerUser(ctx.app, 'admin@example.com');
            const { out, lines } = fakeLog();
            const config = await runStartupTasks(ctx.db, configWith(), out);
            expect(config.setupToken).toBeNull();
            expect(lines.log.join('\n')).not.toContain('No account exists');
        });
    });

    describe('sealing old webhook URLs', () => {
        it('seals them when a secrets key is set and says how many', async () => {
            const owner = await registerUser(ctx.app, 'owner@example.com');
            const id = await createDiagram(ctx.app, owner, 'hooked');
            await ctx.db.insert(driftSettings).values({ diagramId: id, webhookUrl: 'https://hooks.example.com/token' });
            const { out, lines } = fakeLog();
            await runStartupTasks(ctx.db, configWith({ SECRETS_KEY }), out);
            expect(lines.log).toContain('Encrypted 1 saved webhook URL(s)');
            const [row] = await ctx.db.select().from(driftSettings);
            expect(row.webhookUrl).toMatch(/^v2:/);
        });

        it('leaves them alone without a secrets key', async () => {
            const owner = await registerUser(ctx.app, 'owner@example.com');
            const id = await createDiagram(ctx.app, owner, 'hooked');
            await ctx.db.insert(driftSettings).values({ diagramId: id, webhookUrl: 'https://hooks.example.com/token' });
            await runStartupTasks(ctx.db, configWith(), fakeLog().out);
            const [row] = await ctx.db.select().from(driftSettings);
            expect(row.webhookUrl).toBe('https://hooks.example.com/token');
        });

        it('logs a failure and still goes on, so the server starts', async () => {
            const { out, lines } = fakeLog();
            // the first read, the webhook one, fails; the others (and the user count) work
            let calls = 0;
            const broken = new Proxy(ctx.db, {
                get(target, prop, receiver) {
                    if (prop === 'select') {
                        return (...args: unknown[]) => {
                            calls += 1;
                            if (calls === 1) throw new Error('database is down');
                            return (target.select as (...a: unknown[]) => unknown)(...args);
                        };
                    }
                    return Reflect.get(target, prop, receiver);
                },
            });
            const config = await runStartupTasks(broken, configWith({ SECRETS_KEY }), out);
            expect(lines.error.join('\n')).toContain('Could not encrypt saved webhook URLs: database is down');
            // it went on to the setup token
            expect(config.setupToken).not.toBeNull();
        });
    });

    it('re-seals stored secrets without complaint when there is nothing to do', async () => {
        const { out, lines } = fakeLog();
        await runStartupTasks(ctx.db, configWith({ SECRETS_KEY }), out);
        expect(lines.error).toEqual([]);
        expect(lines.warn).toEqual([]);
    });
});
