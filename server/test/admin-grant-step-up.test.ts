import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, users } from '../src/db/schema.js';
import { as, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

const PASSWORD = 'Password-123!';

/** SEC-037: giving someone administrator rights asks the acting admin for their own password. */
describe('making an administrator: the acting admin proves who they are', () => {
    let ctx: TestCtx;
    let root: TestUser;
    let member: TestUser;

    const send = (method: 'PATCH' | 'POST', url: string, payload: object) =>
        ctx.app.inject({ method, url, headers: as(root), payload });
    const create = (extra: object) =>
        send('POST', '/admin/users', {
            email: `new-${Math.random().toString(36).slice(2)}@example.com`,
            password: 'A-long-temporary-1!',
            ...extra,
        });
    const patch = (id: string, body: object) => send('PATCH', `/admin/users/${id}`, body);
    const adminFlag = async (id: string) =>
        (await ctx.db.select({ a: users.isAdmin }).from(users).where(eq(users.id, id)))[0].a;
    const userCount = async () => (await ctx.db.select({ id: users.id }).from(users)).length;

    beforeAll(async () => {
        ctx = await createTestApp();
        root = await registerUser(ctx.app, 'root@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
    });
    afterAll(() => ctx.close());

    describe('creating an account', () => {
        it('needs no proof for an ordinary account', async () => {
            expect((await create({ isAdmin: false })).statusCode).toBe(201);
            expect((await create({})).statusCode).toBe(201);
        });

        it('refuses an administrator with no proof, and creates nothing', async () => {
            const before = await userCount();
            const res = await create({ isAdmin: true });
            expect(res.statusCode).toBe(403);
            expect(res.json()).toEqual({ error: 'step_up_required' });
            expect(await userCount()).toBe(before);
        });

        it('refuses a wrong password, and creates nothing', async () => {
            const before = await userCount();
            const res = await create({ isAdmin: true, adminPassword: 'not-it' });
            expect(res.statusCode).toBe(403);
            expect(res.json()).toEqual({ error: 'wrong_password' });
            expect(await userCount()).toBe(before);
        });

        it('creates the administrator with the acting admin\'s own password', async () => {
            const res = await create({ isAdmin: true, adminPassword: PASSWORD });
            expect(res.statusCode).toBe(201);
            expect(res.json().isAdmin).toBe(true);
        });
    });

    describe('promoting an account', () => {
        it('refuses with no proof, and leaves the account as it was', async () => {
            const res = await patch(member.id, { isAdmin: true });
            expect(res.statusCode).toBe(403);
            expect(res.json()).toEqual({ error: 'step_up_required' });
            expect(await adminFlag(member.id)).toBe(false);
        });

        it('refuses a wrong password, and leaves the account as it was', async () => {
            const res = await patch(member.id, { isAdmin: true, adminPassword: 'not-it' });
            expect(res.statusCode).toBe(403);
            expect(res.json()).toEqual({ error: 'wrong_password' });
            expect(await adminFlag(member.id)).toBe(false);
        });

        it('promotes with the acting admin\'s own password', async () => {
            const res = await patch(member.id, { isAdmin: true, adminPassword: PASSWORD });
            expect(res.statusCode).toBe(200);
            expect(await adminFlag(member.id)).toBe(true);
        });

        it('needs no proof to take admin rights away, nor for other changes', async () => {
            expect((await patch(member.id, { isActive: false })).statusCode).toBe(200);
            expect((await patch(member.id, { isActive: true })).statusCode).toBe(200);
            expect((await patch(member.id, { isAdmin: false })).statusCode).toBe(200);
            expect(await adminFlag(member.id)).toBe(false);
        });

        it('asks only once when a request both promotes and resets the password of an admin', async () => {
            const before = (
                await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'user.password_check_failed'))
            ).length;
            // the target is an admin, so both the promotion and the reset want proof
            await patch(member.id, { isAdmin: true, adminPassword: PASSWORD });
            const res = await patch(member.id, {
                isAdmin: true,
                password: 'A-brand-new-pass-1!',
                adminPassword: 'not-it',
            });
            expect(res.statusCode).toBe(403);
            const after = (
                await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'user.password_check_failed'))
            ).length;
            expect(after - before).toBe(1);
        });
    });
});
