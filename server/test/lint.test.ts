import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../src/db/schema.js';
import { LINT_BODY_LIMIT } from '../src/lint/routes.js';
import { parseArgs, runCli, type CliIo } from '../src/cli/lint.js';
import diagramFixture from './fixtures/postgres-diagram.json' with { type: 'json' };
import {
    as,
    createTestApp,
    registerUser,
    type TestCtx,
    withBase,
    type TestUser,
    grant,
    projectFor,
} from './helpers.js';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const content = diagramFixture.content as Record<string, unknown>;

/** A diagram that has no lint errors or warnings at all. */
const cleanDiagram = () => {
    const d = clone(content) as { tables: Array<{ name: string; indexes: unknown[]; fields: Array<{ id: string; name: string }>; id: string }> };
    const orders = d.tables.find((t) => t.name === 'orders')!;
    const customerId = orders.fields.find((f) => f.name === 'customer_id')!;
    (orders.indexes as unknown[]).push({ id: 'ix-orders-customer', name: 'idx_orders_customer_id', unique: false, fieldIds: [customerId.id], createdAt: 1 });
    return d;
};

describe('lint API', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let viewer: TestUser;
    let stranger: TestUser;
    let id: string;

    const get = (u: TestUser, url: string) => ctx.app.inject({ url, headers: as(u) });
    const setContent = async (c: object) =>
        ctx.app.inject({ method: 'PUT', url: `/diagrams/${id}`, headers: as(owner), payload: await withBase(ctx.app, owner, id, { content: c }) });

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        id = (await ctx.app.inject({ method: 'POST', url: '/diagrams', headers: as(owner), payload: { ...diagramFixture, projectId: await projectFor(ctx.app) } })).json().id;
        await grant(ctx.app, viewer, 'viewer');
    });
    afterAll(() => ctx.close());

    it('requires login', async () => {
        for (const [method, url] of [
            ['GET', '/lint/rules'],
            ['POST', '/lint'],
            ['GET', `/diagrams/${id}/lint`],
            ['GET', `/diagrams/${id}/lint-config`],
            ['PUT', `/diagrams/${id}/lint-config`],
        ] as const) {
            const res = await ctx.app.inject({ method, url, payload: {} });
            expect(res.statusCode, `${method} ${url}`).toBe(401);
        }
    });

    it('lists the configurable rules', async () => {
        const rules = (await get(owner, '/lint/rules')).json();
        expect(rules.map((r: { id: string }) => r.id)).toContain('table-without-primary-key');
        expect(rules.find((r: { id: string }) => r.id === 'missing-table-description').defaultEnabled).toBe(false);
    });

    describe('stateless', () => {
        it('lints a diagram sent in the body, with config applied', async () => {
            const res = await ctx.app.inject({ method: 'POST', url: '/lint', headers: as(owner), payload: { diagram: content } });
            expect(res.statusCode).toBe(200);
            expect(res.json().findings.map((f: { ruleId: string }) => f.ruleId)).toEqual(['foreign-key-without-index']);
            expect(res.json().summary).toEqual({ error: 0, warning: 1, info: 0, total: 1 });

            const off = await ctx.app.inject({
                method: 'POST',
                url: '/lint',
                headers: as(owner),
                payload: { diagram: content, config: { rules: { 'foreign-key-without-index': { enabled: false } } } },
            });
            expect(off.json().findings).toEqual([]);
        });

        it('rejects a missing diagram and ignores junk config', async () => {
            expect((await ctx.app.inject({ method: 'POST', url: '/lint', headers: as(owner), payload: {} })).statusCode).toBe(400);
            const res = await ctx.app.inject({ method: 'POST', url: '/lint', headers: as(owner), payload: { diagram: content, config: { rules: { nonsense: { enabled: false } } } } });
            expect(res.statusCode).toBe(200);
        });

        it('rejects a diagram whose tables or fields are malformed instead of failing with 500', async () => {
            const post = (diagram: unknown) =>
                ctx.app.inject({ method: 'POST', url: '/lint', headers: as(owner), payload: { diagram } });
            const noFields = { tables: [{ id: 't1', name: 'orders' }] };
            const badField = { tables: [{ id: 't1', name: 'orders', fields: [{ id: 'f1', name: 'id' }] }] };
            const badIndex = { tables: [{ id: 't1', name: 'orders', fields: [], indexes: [{ name: 'ix' }] }] };
            for (const diagram of [noFields, badField, badIndex, { tables: 'orders' }]) {
                expect((await post(diagram)).statusCode, JSON.stringify(diagram)).toBe(400);
            }
            // a diagram with no tables at all is still valid
            expect((await post({})).statusCode).toBe(200);
        });

        it('stores nothing', async () => {
            const before = (await get(owner, `/diagrams/${id}/lint-config`)).json();
            await ctx.app.inject({ method: 'POST', url: '/lint', headers: as(owner), payload: { diagram: content, config: { naming: { style: 'camelCase' } } } });
            expect((await get(owner, `/diagrams/${id}/lint-config`)).json()).toEqual(before);
        });
    });

    describe('a stored diagram', () => {
        it('lints the working copy for editors', async () => {
            const res = await get(owner, `/diagrams/${id}/lint`);
            expect(res.statusCode).toBe(200);
            expect(res.json().source).toBe('working');
            expect(res.json().findings).toHaveLength(1);
        });

        it('keeps the working copy away from viewers and the diagram away from strangers', async () => {
            expect((await get(viewer, `/diagrams/${id}/lint`)).statusCode).toBe(403);
            expect((await get(stranger, `/diagrams/${id}/lint`)).statusCode).toBe(404);
            expect((await get(stranger, `/diagrams/${id}/lint?source=published`)).statusCode).toBe(404);
        });

        it('404s for the published copy until something is published, then lets everyone with access read it', async () => {
            expect((await get(owner, `/diagrams/${id}/lint?source=published`)).json().error).toBe('not_published');
            await ctx.app.inject({ method: 'POST', url: `/diagrams/${id}/publish`, headers: as(owner), payload: {} });
            const res = await get(viewer, `/diagrams/${id}/lint?source=published`);
            expect(res.statusCode).toBe(200);
            expect(res.json().source).toBe('published');
        });

        it('refuses a stored diagram over the size cap, working and published', async () => {
            const fat = { ...clone(content), padding: 'x'.repeat(LINT_BODY_LIMIT + 1024) };
            const big = (await ctx.app.inject({ method: 'POST', url: '/diagrams', headers: as(owner), payload: { title: 'Fat', content: fat, projectId: await projectFor(ctx.app) } })).json().id;
            const working = await get(owner, `/diagrams/${big}/lint`);
            expect(working.statusCode).toBe(413);
            expect(working.json().error).toBe('diagram_too_large');
            await ctx.app.inject({ method: 'POST', url: `/diagrams/${big}/publish`, headers: as(owner), payload: {} });
            const published = await get(owner, `/diagrams/${big}/lint?source=published`);
            expect(published.statusCode).toBe(413);
        });

        it('lints the published copy, not later edits', async () => {
            const broken = clone(content) as { tables: Array<{ fields: Array<{ primaryKey: boolean }> }> };
            broken.tables[0].fields.forEach((f) => (f.primaryKey = false));
            await setContent(broken);
            const working = (await get(owner, `/diagrams/${id}/lint?source=working`)).json();
            const published = (await get(owner, `/diagrams/${id}/lint?source=published`)).json();
            expect(working.findings.some((f: { ruleId: string }) => f.ruleId === 'table-without-primary-key')).toBe(true);
            expect(published.findings.some((f: { ruleId: string }) => f.ruleId === 'table-without-primary-key')).toBe(false);
            await setContent(content);
        });

        it('rejects an unknown source', async () => {
            expect((await get(owner, `/diagrams/${id}/lint?source=draft`)).statusCode).toBe(400);
        });
    });

    describe('per-diagram config', () => {
        it('starts empty and is readable by any member', async () => {
            expect((await get(owner, `/diagrams/${id}/lint-config`)).json()).toEqual({});
            expect((await get(viewer, `/diagrams/${id}/lint-config`)).statusCode).toBe(200);
            expect((await get(stranger, `/diagrams/${id}/lint-config`)).statusCode).toBe(404);
        });

        it('can only be changed by editors', async () => {
            const body = { config: { rules: { 'orphan-table': { enabled: false } } } };
            expect((await ctx.app.inject({ method: 'PUT', url: `/diagrams/${id}/lint-config`, headers: as(viewer), payload: body })).statusCode).toBe(403);
            expect((await ctx.app.inject({ method: 'PUT', url: `/diagrams/${id}/lint-config`, headers: as(stranger), payload: body })).statusCode).toBe(404);
        });

        it('is stored cleaned up, applied to later lint runs, and audited', async () => {
            const res = await ctx.app.inject({
                method: 'PUT',
                url: `/diagrams/${id}/lint-config`,
                headers: as(owner),
                payload: { config: { rules: { 'foreign-key-without-index': { enabled: false }, bogus: { enabled: false } }, naming: { style: 'snake_case', tables: 'weird' } } },
            });
            expect(res.json()).toEqual({ rules: { 'foreign-key-without-index': { enabled: false } }, naming: { style: 'snake_case' } });
            expect((await get(owner, `/diagrams/${id}/lint`)).json().findings).toEqual([]);
            const actions = (await ctx.db.select().from(auditLog)).filter((r) => r.diagramId === id).map((r) => r.action);
            expect(actions).toContain('lint.configure');
            await ctx.app.inject({ method: 'PUT', url: `/diagrams/${id}/lint-config`, headers: as(owner), payload: { config: {} } });
        });

        it('rejects a body without config', async () => {
            expect((await ctx.app.inject({ method: 'PUT', url: `/diagrams/${id}/lint-config`, headers: as(owner), payload: {} })).statusCode).toBe(400);
        });
    });
});

describe('lint CLI', () => {
    const run = (argv: string[], files: Record<string, string> = {}) => {
        let out = '';
        let err = '';
        const io: CliIo = {
            readFile: (p) => {
                if (!(p in files)) throw new Error(`ENOENT: ${p}`);
                return files[p];
            },
            out: (t) => (out += t),
            err: (t) => (err += t),
        };
        return { code: runCli(argv, io), out, err };
    };
    const withErrors = () => {
        const d = clone(content) as { tables: Array<{ fields: Array<{ primaryKey: boolean }> }> };
        d.tables[0].fields.forEach((f) => (f.primaryKey = false)); // a table without a primary key is an error
        return JSON.stringify(d);
    };
    const warningsOnly = JSON.stringify(content); // one warning: FK without index
    const clean = JSON.stringify(cleanDiagram());

    describe('arguments', () => {
        it('parses files, options and flags', () => {
            expect(parseArgs(['d.json', '--config', 'c.json', '--format', 'json', '--fail-on', 'warning', '--database-type', 'mysql'])).toEqual({
                file: 'd.json', config: 'c.json', format: 'json', failOn: 'warning', databaseType: 'mysql', help: false,
            });
            expect(parseArgs([])).toEqual({ format: 'text', failOn: 'error', help: false });
            expect(parseArgs(['-h'])).toMatchObject({ help: true });
        });

        it('rejects bad input', () => {
            expect(parseArgs(['--format', 'xml'])).toEqual({ error: '--format must be text or json' });
            expect(parseArgs(['--fail-on', 'loud'])).toHaveProperty('error');
            expect(parseArgs(['--config'])).toEqual({ error: '--config needs a value' });
            expect(parseArgs(['--nope'])).toEqual({ error: 'unknown option --nope' });
            expect(parseArgs(['a.json', 'b.json'])).toEqual({ error: 'only one diagram file is accepted' });
        });
    });

    describe('exit codes', () => {
        it('exits 0 and says so when nothing is wrong', () => {
            const r = run(['d.json'], { 'd.json': clean });
            expect(r.code).toBe(0);
            expect(r.out).toBe('No problems found.\n');
        });

        it('exits 1 when there are errors', () => {
            const r = run(['d.json'], { 'd.json': withErrors() });
            expect(r.code).toBe(1);
            expect(r.out).toMatch(/ERROR\s+table-without-primary-key/);
            expect(r.out).toMatch(/\d+ problem\(s\): [1-9]\d* error/);
        });

        it('does not fail on warnings by default, but does with --fail-on warning', () => {
            expect(run(['d.json'], { 'd.json': warningsOnly }).code).toBe(0);
            expect(run(['d.json', '--fail-on', 'warning'], { 'd.json': warningsOnly }).code).toBe(1);
            expect(run(['d.json', '--fail-on', 'info'], { 'd.json': warningsOnly }).code).toBe(1);
        });

        it('never fails with --fail-on never', () => {
            expect(run(['d.json', '--fail-on', 'never'], { 'd.json': withErrors() }).code).toBe(0);
        });

        it('exits 2 for usage and input problems, writing to stderr', () => {
            for (const [argv, files] of [
                [[], {}],
                [['--nope'], {}],
                [['missing.json'], {}],
                [['d.json'], { 'd.json': 'not json' }],
                [['d.json'], { 'd.json': '{"hello":1}' }],
                [['d.json', '--config', 'c.json'], { 'd.json': clean, 'c.json': '{' }],
            ] as Array<[string[], Record<string, string>]>) {
                const r = run(argv, files);
                expect(r.code, JSON.stringify(argv)).toBe(2);
                expect(r.err.length).toBeGreaterThan(0);
            }
        });

        it('prints help and exits 0', () => {
            const r = run(['--help']);
            expect(r.code).toBe(0);
            expect(r.out).toMatch(/Usage: lint/);
        });
    });

    describe('input and output', () => {
        it('accepts the server wrapper as well as a plain export', () => {
            expect(run(['d.json'], { 'd.json': JSON.stringify({ title: 'x', content: JSON.parse(withErrors()) }) }).code).toBe(1);
        });

        it('applies a config file', () => {
            const cfg = JSON.stringify({ rules: { 'table-without-primary-key': { enabled: false } } });
            const r = run(['d.json', '--config', 'c.json'], { 'd.json': withErrors(), 'c.json': cfg });
            expect(r.code).toBe(0);
        });

        it('can raise a rule to an error', () => {
            const cfg = JSON.stringify({ rules: { 'foreign-key-without-index': { severity: 'error' } } });
            expect(run(['d.json', '--config', 'c.json'], { 'd.json': warningsOnly, 'c.json': cfg }).code).toBe(1);
        });

        it('prints JSON that CI can parse', () => {
            const r = run(['d.json', '--format', 'json'], { 'd.json': withErrors() });
            const parsed = JSON.parse(r.out);
            expect(parsed.summary.error).toBeGreaterThan(0);
            expect(parsed.findings[0]).toHaveProperty('ruleId');
            expect(r.code).toBe(1);
        });

        it('lets the database type be overridden', () => {
            const d = clone(content) as { tables: Array<{ fields: Array<{ name: string; type: { id: string; name: string } }> }> };
            d.tables[0].fields.find((f) => f.name === 'email')!.type = { id: 'varchar', name: 'varchar' };
            const r = run(['d.json', '--database-type', 'sql_server', '--format', 'json'], { 'd.json': JSON.stringify({ ...d, databaseType: 'postgresql' }) });
            expect(JSON.parse(r.out).findings.some((f: { ruleId: string }) => f.ruleId === 'varchar-without-length')).toBe(false); // email has a length in the fixture
        });
    });

    describe('as a real process', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'qubdi-lint-'));
        const write = (name: string, body: string) => {
            const p = path.join(dir, name);
            writeFileSync(p, body);
            return p;
        };
        const spawn = (args: string[]) =>
            spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/lint.ts', ...args], {
                cwd: path.resolve(__dirname, '..'),
                encoding: 'utf8',
                timeout: 60_000,
            });

        it('exits non-zero when errors exist', () => {
            const r = spawn([write('bad.json', withErrors())]);
            expect(r.status).toBe(1);
            expect(r.stdout).toMatch(/table-without-primary-key/);
        });

        it('exits zero when the diagram is clean', () => {
            const r = spawn([write('ok.json', clean)]);
            expect(r.status).toBe(0);
            expect(r.stdout).toContain('No problems found.');
        });

        it('exits 2 for a missing file', () => {
            const r = spawn([path.join(dir, 'nope.json')]);
            expect(r.status).toBe(2);
            expect(r.stderr).toMatch(/cannot read input/);
        });
    });
});

describe('lint route limits', () => {
    const post = (ctx: TestCtx, user: TestUser, diagram: object) =>
        ctx.app.inject({
            method: 'POST',
            url: '/lint',
            headers: as(user),
            payload: { diagram },
        });

    it('limits /lint per user, not per address', async () => {
        const ctx = await createTestApp({ lintRateLimit: 2 });
        try {
            const a = await registerUser(ctx.app, 'a@example.com');
            const b = await registerUser(ctx.app, 'b@example.com');
            const codes = [];
            for (let i = 0; i < 3; i++) {
                codes.push((await post(ctx, a, { tables: [] })).statusCode);
            }
            expect(codes).toEqual([200, 200, 429]);
            // another user from the same address has their own allowance
            expect((await post(ctx, b, { tables: [] })).statusCode).toBe(200);
        } finally {
            await ctx.close();
        }
    });

    it('refuses a diagram over the size cap', async () => {
        const ctx = await createTestApp({ bodyLimit: 1024 * 1024 });
        try {
            const user = await registerUser(ctx.app, 'a@example.com');
            const res = await post(ctx, user, {
                tables: [],
                filler: 'x'.repeat(6 * 1024 * 1024),
            });
            expect(res.statusCode).toBe(413);
        } finally {
            await ctx.close();
        }
    });
});
