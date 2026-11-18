import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { diagramLocks, lockPokes, sessions } from '../src/db/schema.js';
import {
    POKE_COOLDOWN_SECONDS,
    POKE_WAIT_SECONDS,
    settlePokesOnRelease,
} from '../src/diagrams/poke.js';
import { purgeOldPokes } from '../src/maintenance.js';
import {
    as,
    createDiagram,
    createTestApp,
    grant,
    registerUser,
    sampleContent,
    type TestCtx,
    type TestUser,
} from './helpers.js';

/**
 * A reader of one lock stream over a real socket. A read that gave up waiting
 * stays pending for the next one, so no chunk is ever lost between two calls.
 */
async function openLockStream(
    base: string,
    id: string,
    who: Pick<TestUser, 'cookie'> | null,
    editorId: string | null
) {
    const controller = new AbortController();
    const query = editorId === null ? '' : `?editorId=${encodeURIComponent(editorId)}`;
    const res = await fetch(`${base}/diagrams/${id}/lock/events${query}`, {
        signal: controller.signal,
        headers: who ? { cookie: who.cookie } : {},
    });
    const reader = res.status === 200 ? res.body?.getReader() : undefined;
    const decoder = new TextDecoder();
    let buffer = '';
    let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

    const more = async (ms: number): Promise<'chunk' | 'timeout' | 'done'> => {
        if (!reader) return 'done';
        if (!pending) {
            pending = reader.read();
            pending.catch(() => undefined);
        }
        const got = await Promise.race([
            pending,
            new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms)),
        ]);
        if (got === 'timeout') return 'timeout';
        pending = null;
        if (got.done) return 'done';
        buffer += decoder.decode(got.value);
        return 'chunk';
    };

    return {
        status: res.status,
        headers: res.headers,
        json: () => res.json(),
        /** the next event of this name, parsed; others stay in the buffer */
        async event(name: string, ms = 4000): Promise<Record<string, unknown>> {
            const deadline = Date.now() + ms;
            for (;;) {
                const found = new RegExp(`event: ${name}\\ndata: (.*)\\n\\n`).exec(buffer);
                if (found) {
                    buffer = buffer.slice(found.index + found[0].length);
                    return JSON.parse(found[1]) as Record<string, unknown>;
                }
                const left = deadline - Date.now();
                const step = left > 0 ? await more(left) : 'timeout';
                if (step !== 'chunk') {
                    throw new Error(`no ${name} event (${step}); got ${JSON.stringify(buffer)}`);
                }
            }
        },
        /** true when no event arrives for `ms` */
        async quiet(ms: number): Promise<boolean> {
            const deadline = Date.now() + ms;
            for (;;) {
                if (/event: /.test(buffer)) return false;
                const left = deadline - Date.now();
                if (left <= 0) return true;
                if ((await more(left)) !== 'chunk') return true;
            }
        },
        async text(needle: string, ms = 4000): Promise<string> {
            const deadline = Date.now() + ms;
            while (!buffer.includes(needle)) {
                const left = deadline - Date.now();
                if (left <= 0 || (await more(left)) !== 'chunk') {
                    throw new Error(`no ${needle}; got ${JSON.stringify(buffer)}`);
                }
            }
            return buffer;
        },
        async ended(ms = 4000): Promise<boolean> {
            const deadline = Date.now() + ms;
            for (;;) {
                const left = deadline - Date.now();
                if (left <= 0) return false;
                if ((await more(left)) === 'done') return true;
            }
        },
        close: () => controller.abort(),
    };
}

describe('asking the editor of a locked diagram to step out', () => {
    let ctx: TestCtx;
    let base: string;
    let a: TestUser;
    let b: TestUser;
    let c: TestUser;
    let viewer: TestUser;
    let stranger: TestUser;
    let id: string;
    const open: Array<{ close: () => void }> = [];

    const lock = (who: TestUser, editorId: string, diagram = id) =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagram}/lock`,
            headers: as(who),
            payload: { editorId },
        });
    const release = (who: TestUser, editorId: string) =>
        ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${id}/lock?editorId=${editorId}`,
            headers: as(who),
        });
    const poke = (who: TestUser | null, editorId: string, diagram = id) =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagram}/lock/poke`,
            headers: who ? as(who) : {},
            payload: { editorId },
        });
    const answer = (
        who: TestUser,
        pokeId: string,
        editorId: string,
        accept: unknown,
        diagram = id
    ) =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagram}/lock/pokes/${pokeId}/answer`,
            headers: as(who),
            payload: { editorId, accept },
        });
    const stream = async (
        who: Pick<TestUser, 'cookie'> | null,
        editorId: string | null,
        diagram = id
    ) => {
        const s = await openLockStream(base, diagram, who, editorId);
        open.push(s);
        return s;
    };
    const lockRow = async () =>
        (await ctx.db.select().from(diagramLocks).where(eq(diagramLocks.diagramId, id)))[0];
    const pokeRows = () => ctx.db.select().from(lockPokes);
    const save = async (who: TestUser, name: string, editorId: string) => {
        const current = await ctx.app.inject({
            url: `/diagrams/${id}`,
            headers: as(who),
        });
        return ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(who),
            payload: {
                content: { ...sampleContent, name },
                baseUpdatedAt: current.json().updatedAt,
                editorId,
            },
        });
    };
    /** a holds the lock on tab-a and b has poked it from tab-b */
    const poked = async () => {
        await lock(a, 'tab-a');
        const res = await poke(b, 'tab-b');
        expect(res.statusCode).toBe(202);
        return res.json().pokeId as string;
    };

    beforeAll(async () => {
        ctx = await createTestApp();
        a = await registerUser(ctx.app, 'a@example.com');
        b = await registerUser(ctx.app, 'b@example.com');
        c = await registerUser(ctx.app, 'c@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        id = await createDiagram(ctx.app, a);
        await grant(ctx.app, b, 'editor');
        await grant(ctx.app, c, 'editor');
        await grant(ctx.app, viewer, 'viewer');
        base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    });
    afterAll(() => ctx.close());
    beforeEach(async () => {
        open.splice(0).forEach((s) => s.close());
        await ctx.db.delete(lockPokes);
        await ctx.db.delete(diagramLocks);
    });

    describe('poking', () => {
        it('tells the holder at once who is asking, and for how long the request stands', async () => {
            await lock(a, 'tab-a');
            const holder = await stream(a, 'tab-a');
            await holder.text(': connected');

            const res = await poke(b, 'tab-b');
            expect(res.statusCode).toBe(202);
            const sent = res.json();
            expect(sent).toMatchObject({ status: 'sent', holder: 'a@example.com' });

            // how long is left, as seconds: a browser's clock may be off
            const heard = await holder.event('poke');
            expect(heard).toEqual({
                pokeId: sent.pokeId,
                from: 'b@example.com',
                waitSeconds: expect.any(Number),
            });
            for (const waits of [sent.waitSeconds, heard.waitSeconds as number]) {
                expect(waits).toBeGreaterThan(POKE_WAIT_SECONDS - 10);
                expect(waits).toBeLessThanOrEqual(POKE_WAIT_SECONDS);
            }
        });

        it('gives the diagram to the one who asks when nobody holds it', async () => {
            const res = await poke(b, 'tab-b');
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ status: 'granted' });
            // kept for b, not for the page that asked: that one reloads, and a
            // reloaded page is a new editor
            expect(await lockRow()).toMatchObject({
                userId: b.id,
                editorId: expect.stringMatching(/^handoff:/),
            });
            expect(await pokeRows()).toHaveLength(0);
            expect((await lock(c, 'tab-c')).json()).toEqual({
                held: false,
                holder: 'b@example.com',
            });
            expect((await lock(b, 'b-after-reload')).json()).toEqual({ held: true });
            expect(await lockRow()).toMatchObject({ editorId: 'b-after-reload' });
        });

        it('treats a lock nobody renewed as free', async () => {
            await lock(a, 'tab-a');
            await ctx.db
                .update(diagramLocks)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(diagramLocks.diagramId, id));
            expect((await poke(b, 'tab-b')).json()).toEqual({ status: 'granted' });
            expect(await lockRow()).toMatchObject({ userId: b.id });
        });

        it('has nobody to ask when the editor already holds the lock itself', async () => {
            await lock(a, 'tab-a');
            expect((await poke(a, 'tab-a')).json()).toEqual({ status: 'granted' });
            expect(await pokeRows()).toHaveLength(0);
            expect(await lockRow()).toMatchObject({ userId: a.id });
        });

        it('is only for people who can edit', async () => {
            await lock(a, 'tab-a');
            expect((await poke(viewer, 'tab-v')).statusCode).toBe(403);
            expect((await poke(stranger, 'tab-s')).statusCode).toBe(404);
            expect((await poke(null, 'x')).statusCode).toBe(401);
            expect(await pokeRows()).toHaveLength(0);
        });

        it('needs an editor id', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/lock/poke`,
                headers: as(b),
                payload: {},
            });
            expect(res.statusCode).toBe(400);
        });

        it('says not found for a diagram that is gone', async () => {
            expect((await poke(b, 'tab-b', randomUUID())).statusCode).toBe(404);
        });

        it('lets one person ask once in five minutes, whatever the answer was', async () => {
            const first = await poked();
            expect((await answer(a, first, 'tab-a', false)).statusCode).toBe(204);

            const again = await poke(b, 'tab-b');
            expect(again.statusCode).toBe(429);
            expect(again.json().error).toBe('poke_cooldown');
            const wait = Number(again.headers['retry-after']);
            expect(wait).toBeGreaterThan(POKE_COOLDOWN_SECONDS - 10);
            expect(wait).toBeLessThanOrEqual(POKE_COOLDOWN_SECONDS);
            expect(again.json().retryAfterSeconds).toBe(wait);

            // somebody else may ask meanwhile: the wait is each person's own
            const others = await poke(c, 'tab-c');
            expect(others.statusCode).toBe(202);
            await answer(a, others.json().pokeId, 'tab-a', false);

            // once the five minutes are over the same person may ask again
            await ctx.db
                .update(lockPokes)
                .set({ createdAt: new Date(Date.now() - (POKE_COOLDOWN_SECONDS + 60) * 1000) })
                .where(eq(lockPokes.requesterId, b.id));
            expect((await poke(b, 'tab-b')).statusCode).toBe(202);
        });

        it('lets one request wait at a time, and not for ever', async () => {
            await lock(a, 'tab-a');
            const first = (await poke(b, 'tab-b')).json().pokeId;
            const second = await poke(c, 'tab-c');
            expect(second.statusCode).toBe(409);
            expect(second.json().error).toBe('poke_pending');

            // nobody answered in time: the place is free again
            await ctx.db
                .update(lockPokes)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(lockPokes.id, first));
            expect((await poke(c, 'tab-c')).statusCode).toBe(202);
            const rows = await pokeRows();
            expect(rows.find((r) => r.id === first)?.status).toBe('expired');
        });
    });

    describe('answering', () => {
        it('hands the lock to the one who asked when the holder agrees', async () => {
            const pokeId = await poked();
            const requester = await stream(b, 'tab-b');
            await requester.text(': connected');

            expect((await answer(a, pokeId, 'tab-a', true)).statusCode).toBe(204);

            expect(await requester.event('poke-result')).toEqual({
                pokeId,
                outcome: 'accepted',
            });
            expect(await lockRow()).toMatchObject({
                userId: b.id,
                editorId: expect.stringMatching(/^handoff:/),
            });
            // the old holder is out, and nobody but b can come in
            expect((await save(a, 'late save', 'tab-a')).statusCode).toBe(423);
            for (const [who, tab] of [
                [a, 'tab-a'],
                [c, 'tab-c'],
            ] as const) {
                expect((await lock(who, tab)).json()).toEqual({
                    held: false,
                    holder: 'b@example.com',
                });
            }
            expect((await save(c, 'by c', 'tab-c')).statusCode).toBe(423);
            // b's page reloads (a new editor id) and claims it
            expect((await lock(b, 'tab-b-reloaded')).json()).toEqual({ held: true });
            expect((await save(b, 'by b', 'tab-b-reloaded')).statusCode).toBe(200);
            expect((await lock(c, 'tab-c')).json()).toMatchObject({ held: false });
        });

        it('lets the set-aside lock run out when its page never comes', async () => {
            const pokeId = await poked();
            await answer(a, pokeId, 'tab-a', true);
            await ctx.db
                .update(diagramLocks)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(diagramLocks.diagramId, id));
            expect((await lock(c, 'tab-c')).json()).toEqual({ held: true });
        });

        it('asks nobody while the diagram is being handed to someone else', async () => {
            const pokeId = await poked();
            await answer(a, pokeId, 'tab-a', true);
            // c finds it taken by b, whose page has not claimed it yet
            const res = await poke(c, 'tab-c');
            expect(res.statusCode).toBe(409);
            expect(res.json().error).toBe('lock_busy');
            expect(await pokeRows()).toHaveLength(1);
            // for b it is theirs already
            expect((await poke(b, 'tab-b2')).json()).toEqual({ status: 'granted' });
        });

        it('keeps the lock with the holder when it declines, and tells the one who asked', async () => {
            const pokeId = await poked();
            const requester = await stream(b, 'tab-b');
            await requester.text(': connected');

            expect((await answer(a, pokeId, 'tab-a', false)).statusCode).toBe(204);

            expect(await requester.event('poke-result')).toEqual({
                pokeId,
                outcome: 'declined',
            });
            expect(await lockRow()).toMatchObject({ userId: a.id, editorId: 'tab-a' });
            expect((await lock(b, 'tab-b')).json()).toMatchObject({ held: false });
        });

        it('lets only the tab that was asked answer, and only once', async () => {
            const pokeId = await poked();
            // the one who asked, another person, another tab of the holder, a made-up request
            expect((await answer(b, pokeId, 'tab-b', true)).statusCode).toBe(404);
            expect((await answer(c, pokeId, 'tab-a', true)).statusCode).toBe(404);
            expect((await answer(a, pokeId, 'tab-2', true)).statusCode).toBe(404);
            expect((await answer(a, randomUUID(), 'tab-a', true)).statusCode).toBe(404);
            expect((await answer(a, pokeId, 'tab-a', 'yes')).statusCode).toBe(400);
            // none of that moved the lock or settled the request
            expect(await lockRow()).toMatchObject({ userId: a.id });
            expect((await pokeRows())[0].status).toBe('pending');

            expect((await answer(a, pokeId, 'tab-a', false)).statusCode).toBe(204);
            const twice = await answer(a, pokeId, 'tab-a', true);
            expect(twice.statusCode).toBe(409);
            expect(twice.json().error).toBe('poke_answered');
            expect(await lockRow()).toMatchObject({ userId: a.id });
        });

        it('refuses an answer that came after the request stopped waiting', async () => {
            const pokeId = await poked();
            await ctx.db
                .update(lockPokes)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(lockPokes.id, pokeId));
            const res = await answer(a, pokeId, 'tab-a', true);
            expect(res.statusCode).toBe(410);
            expect(res.json().error).toBe('poke_expired');
            expect(await lockRow()).toMatchObject({ userId: a.id });
        });

        it('hands over nothing when the holder no longer has the lock', async () => {
            const pokeId = await poked();
            await ctx.db
                .update(diagramLocks)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(diagramLocks.diagramId, id));
            const res = await answer(a, pokeId, 'tab-a', true);
            expect(res.statusCode).toBe(409);
            expect(res.json().error).toBe('lock_changed');
            // and the diagram is free for whoever asks
            expect((await lock(b, 'tab-b')).json()).toEqual({ held: true });
        });

        it('lets a page that is not the holder\'s release nothing and tell nobody', async () => {
            await poked();
            await release(c, 'tab-a'); // right editor id, wrong user
            expect((await pokeRows())[0].status).toBe('pending');
            expect(await lockRow()).toMatchObject({ userId: a.id, editorId: 'tab-a' });
        });

        it('tells the one waiting when the holder leaves the diagram instead of answering', async () => {
            const pokeId = await poked();
            const requester = await stream(b, 'tab-b');
            await requester.text(': connected');

            // another tab letting go changes nothing
            await release(a, 'tab-2');
            expect(await requester.quiet(200)).toBe(true);

            expect((await release(a, 'tab-a')).statusCode).toBe(204);
            expect(await requester.event('poke-result')).toEqual({ pokeId, outcome: 'left' });
            expect((await pokeRows())[0].status).toBe('left');
            // set aside for the one who waited, so nobody else slips in first
            expect(await lockRow()).toMatchObject({
                userId: b.id,
                editorId: expect.stringMatching(/^handoff:/),
            });
            expect((await lock(c, 'tab-c')).json()).toMatchObject({ held: false });
            expect((await lock(b, 'tab-b-reloaded')).json()).toEqual({ held: true });
        });
    });

    describe('when the holder leaves and someone else is first', () => {
        it('SRV-045: tells the one who waited nothing when another tab already holds the diagram', async () => {
            await poked();
            const requester = await stream(b, 'tab-b');
            await requester.text(': connected');
            // a's lock goes and c takes the free diagram before the leaving is settled
            await ctx.db.delete(diagramLocks);
            expect((await lock(c, 'tab-c')).json()).toEqual({ held: true });

            await settlePokesOnRelease(ctx.db, id, a.id, 'tab-a');

            // the diagram was not set aside for b, so b is not told it can have it
            expect(await requester.quiet(300)).toBe(true);
            expect(await lockRow()).toMatchObject({ userId: c.id, editorId: 'tab-c' });
        });
    });

    describe('the lock stream', () => {
        it('shows a request that was sent while the holder was not connected', async () => {
            await poked();
            const pokeId = (await pokeRows())[0].id;
            const holder = await stream(a, 'tab-a');
            const heard = await holder.event('poke');
            expect(heard).toMatchObject({ pokeId, from: 'b@example.com' });
            expect(heard.waitSeconds).toBeGreaterThan(POKE_WAIT_SECONDS - 10);
        });

        it('shows the answer to someone who was away when it came, for a while', async () => {
            const pokeId = await poked();
            await answer(a, pokeId, 'tab-a', true);

            const back = await stream(b, 'tab-b');
            expect(await back.event('poke-result')).toEqual({ pokeId, outcome: 'accepted' });

            await ctx.db
                .update(lockPokes)
                .set({ answeredAt: new Date(Date.now() - 10 * 60 * 1000) })
                .where(eq(lockPokes.id, pokeId));
            const later = await stream(b, 'tab-b');
            await later.text(': connected');
            expect(await later.quiet(300)).toBe(true);
        });

        it('does not show a waiting request to a tab that does not hold the lock', async () => {
            await poked();
            const other = await stream(a, 'tab-2');
            await other.text(': connected');
            expect(await other.quiet(300)).toBe(true);
        });

        it('sends each event only to the tab it is for', async () => {
            await lock(a, 'tab-a');
            const holder = await stream(a, 'tab-a');
            const otherTab = await stream(a, 'tab-2');
            const bystander = await stream(c, 'tab-c');
            const requester = await stream(b, 'tab-b');
            for (const s of [holder, otherTab, bystander, requester]) {
                await s.text(': connected');
            }

            const { pokeId } = (await poke(b, 'tab-b')).json();
            await holder.event('poke');
            expect(await otherTab.quiet(300)).toBe(true);
            expect(await bystander.quiet(100)).toBe(true);
            expect(await requester.quiet(100)).toBe(true);

            await answer(a, pokeId, 'tab-a', false);
            await requester.event('poke-result');
            expect(await holder.quiet(300)).toBe(true);
            expect(await otherTab.quiet(100)).toBe(true);
            expect(await bystander.quiet(100)).toBe(true);
        });

        it('is only for people who can edit', async () => {
            const asViewer = await stream(viewer, 'tab-v');
            expect(asViewer.status).toBe(403);
            const asStranger = await stream(stranger, 'tab-s');
            expect(asStranger.status).toBe(404);
            const signedOut = await stream(null, 'x');
            expect(signedOut.status).toBe(401);
            const noEditor = await stream(a, null);
            expect(noEditor.status).toBe(400);
            const gone = await stream(b, 'tab-b', randomUUID());
            expect(gone.status).toBe(404);
        });

        it('carries the same security headers as every other API response', async () => {
            const s = await stream(a, 'tab-a');
            const normal = await ctx.app.inject({ url: `/diagrams/${id}`, headers: as(a) });
            expect(s.status).toBe(200);
            expect(s.headers.get('content-type')).toBe('text/event-stream');
            expect(s.headers.get('cache-control')).toBe('no-cache, no-transform');
            for (const name of [
                'x-content-type-options',
                'x-frame-options',
                'referrer-policy',
                'content-security-policy',
            ]) {
                expect(s.headers.get(name), name).toBe(String(normal.headers[name]));
            }
        });
    });

    describe('housekeeping', () => {
        it('forgets requests a day after they were made, and keeps the recent ones', async () => {
            const old = await poked();
            await answer(a, old, 'tab-a', false);
            await ctx.db
                .update(lockPokes)
                .set({ createdAt: new Date(Date.now() - 2 * 86_400_000) })
                .where(eq(lockPokes.id, old));
            const fresh = (await poke(c, 'tab-c')).json().pokeId;

            expect(await purgeOldPokes(ctx.db)).toBe(1);
            expect((await pokeRows()).map((r) => r.id)).toEqual([fresh]);
        });

        it('goes away with the diagram', async () => {
            const other = await createDiagram(ctx.app, a, 'short lived');
            await lock(a, 'tab-a', other);
            expect((await poke(b, 'tab-b', other)).statusCode).toBe(202);
            expect(await pokeRows()).toHaveLength(1);
            await ctx.app.inject({
                method: 'DELETE',
                url: `/diagrams/${other}`,
                headers: as(a),
            });
            expect(await pokeRows()).toHaveLength(0);
        });
    });
});

describe('the lock stream and the editor\'s session', () => {
    it('closes once the session ends, and stays open while it lasts', async () => {
        const ctx = await createTestApp({ sseHeartbeatSeconds: 1 });
        try {
            const a = await registerUser(ctx.app, 'a@example.com');
            const id = await createDiagram(ctx.app, a);
            const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
            const s = await openLockStream(base, id, a, 'tab-a');
            await s.text(': connected');
            await s.text(': ping');
            await ctx.db.delete(sessions);
            expect(await s.ended(5000)).toBe(true);
        } finally {
            await ctx.close();
        }
    });

    it('SRV-044: hears a request it missed, on the next beat, and only once', async () => {
        const ctx = await createTestApp({ sseHeartbeatSeconds: 1 });
        try {
            const a = await registerUser(ctx.app, 'a@example.com');
            const b = await registerUser(ctx.app, 'b@example.com');
            const id = await createDiagram(ctx.app, a);
            await grant(ctx.app, b, 'editor');
            const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/lock`,
                headers: as(a),
                payload: { editorId: 'tab-a' },
            });
            const s = await openLockStream(base, id, a, 'tab-a');
            await s.text(': connected');
            // a request whose event never reached the stream (a gap in the
            // database's LISTEN connection): only the table knows about it
            const [row] = await ctx.db
                .insert(lockPokes)
                .values({
                    diagramId: id,
                    requesterId: b.id,
                    requesterEditorId: 'tab-b',
                    holderId: a.id,
                    holderEditorId: 'tab-a',
                    expiresAt: new Date(Date.now() + 60_000),
                })
                .returning({ id: lockPokes.id });
            expect(await s.event('poke', 5000)).toMatchObject({ pokeId: row.id });
            // the next beats (one a second) do not tell it again
            expect(await s.quiet(2500)).toBe(true);
            s.close();
        } finally {
            await ctx.close();
        }
    });

    it('closes when the editor loses the right to edit', async () => {
        const ctx = await createTestApp({ sseHeartbeatSeconds: 1 });
        try {
            const admin = await registerUser(ctx.app, 'admin@example.com');
            const e = await registerUser(ctx.app, 'e@example.com');
            const id = await createDiagram(ctx.app, admin);
            await grant(ctx.app, e, 'editor');
            const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
            const s = await openLockStream(base, id, e, 'tab-e');
            await s.text(': connected');
            await grant(ctx.app, e, 'viewer');
            expect(await s.ended(5000)).toBe(true);
        } finally {
            await ctx.close();
        }
    });

    it('does not keep the server from shutting down', async () => {
        const ctx = await createTestApp();
        const a = await registerUser(ctx.app, 'a@example.com');
        const id = await createDiagram(ctx.app, a);
        const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
        const s = await openLockStream(base, id, a, 'tab-a');
        await s.text(': connected');
        const closing = ctx.close();
        expect(await s.ended(5000)).toBe(true);
        await closing;
    });
});
