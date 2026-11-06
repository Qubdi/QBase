import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/sessions.js';
import { sharedUserLimit } from '../src/lib/rate-key.js';

const request = (userId: string | null, cookie?: string) =>
    ({
        user: userId ? { id: userId } : null,
        cookies: cookie ? { [SESSION_COOKIE]: cookie } : {},
        ip: '203.0.113.9',
    }) as unknown as FastifyRequest;

/** A reply that records what the hook did with it. */
const reply = () => {
    const sent = { status: 0, headers: {} as Record<string, unknown> };
    const r = {
        code(status: number) {
            sent.status = status;
            return r;
        },
        header(name: string, value: unknown) {
            sent.headers[name] = value;
            return r;
        },
        send() {
            return r;
        },
    };
    return { reply: r as unknown as FastifyReply, sent };
};

describe('sharedUserLimit', () => {
    afterEach(() => vi.restoreAllMocks());

    const hit = async (
        hook: ReturnType<typeof sharedUserLimit>,
        req: FastifyRequest
    ) => {
        const { reply: r, sent } = reply();
        await hook(req, r);
        return sent.status;
    };

    it('counts a signed-in user once, whatever session or cookie they use', async () => {
        const hook = sharedUserLimit(2);
        expect(await hit(hook, request('u1', 'session-a'))).toBe(0);
        expect(await hit(hook, request('u1', 'session-b'))).toBe(0);
        expect(await hit(hook, request('u1', 'session-c'))).toBe(429);
        // someone else has an allowance of their own
        expect(await hit(hook, request('u2', 'session-d'))).toBe(0);
    });

    it('tells the caller when to retry', async () => {
        const hook = sharedUserLimit(1);
        await hit(hook, request('u1'));
        const { reply: r, sent } = reply();
        await hook(request('u1'), r);
        expect(sent.status).toBe(429);
        expect(Number(sent.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('opens a new window for each user when theirs has closed, in any order', async () => {
        let now = 1_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const hook = sharedUserLimit(1, 60_000);

        await hit(hook, request('early')); // window closes at +60 s
        now += 30_000;
        await hit(hook, request('late')); // window closes at +90 s
        expect(await hit(hook, request('early'))).toBe(429);
        expect(await hit(hook, request('late'))).toBe(429);

        now += 31_000; // +61 s: only the first window has closed
        expect(await hit(hook, request('early'))).toBe(0);
        expect(await hit(hook, request('late'))).toBe(429);

        now += 30_000; // +91 s: the second has closed too
        expect(await hit(hook, request('late'))).toBe(0);
    });

    it('still limits a request that has no user, by its session', async () => {
        const hook = sharedUserLimit(1);
        expect(await hit(hook, request(null, 'junk'))).toBe(0);
        expect(await hit(hook, request(null, 'junk'))).toBe(429);
        expect(await hit(hook, request(null, 'other'))).toBe(0);
    });
});
