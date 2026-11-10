import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { onLinkChanged } from '../src/events.js';
import { as, createDiagram, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

// every audit write fails, as if the log were gone: the viewers must still be told
const broken = vi.hoisted(() => ({ on: false }));
vi.mock('../src/audit/audit.js', async (original) => {
    const real = await original<typeof import('../src/audit/audit.js')>();
    return {
        ...real,
        audit: (...args: Parameters<typeof real.audit>) =>
            broken.on ? Promise.reject(new Error('log is gone')) : real.audit(...args),
    };
});

describe('a link change reaches live viewers even when its log row fails', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let diagram: string;

    const newLink = async (): Promise<string> => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagram}/share-links`,
            headers: as(admin),
            payload: {},
        });
        expect(res.statusCode).toBe(201);
        return res.json().id as string;
    };

    /** Runs a request with the log broken and returns the links the bus announced. */
    const heardDuring = async (request: (linkId: string) => Promise<unknown>) => {
        const linkId = await newLink();
        const heard: string[] = [];
        const stop = onLinkChanged((id) => heard.push(id));
        broken.on = true;
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await request(linkId);
        } finally {
            broken.on = false;
            log.mockRestore();
            stop();
        }
        return { linkId, heard };
    };

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        diagram = await createDiagram(ctx.app, admin, 'Shared');
    });
    afterAll(() => ctx.close());

    it('on revoke by the owner', async () => {
        const { linkId, heard } = await heardDuring((id) =>
            ctx.app.inject({ method: 'DELETE', url: `/diagrams/${diagram}/share-links/${id}`, headers: as(admin) })
        );
        expect(heard).toContain(linkId);
    });

    it('on a change of access', async () => {
        const { linkId, heard } = await heardDuring((id) =>
            ctx.app.inject({
                method: 'PATCH',
                url: `/diagrams/${diagram}/share-links/${id}`,
                headers: as(admin),
                payload: { access: 'signed_in' },
            })
        );
        expect(heard).toContain(linkId);
    });

    it('on regenerate', async () => {
        const { linkId, heard } = await heardDuring((id) =>
            ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${diagram}/share-links/${id}/regenerate`,
                headers: as(admin),
            })
        );
        expect(heard).toContain(linkId);
    });

    it('on revoke by an admin', async () => {
        const { linkId, heard } = await heardDuring((id) =>
            ctx.app.inject({
                method: 'DELETE',
                url: `/admin/diagrams/${diagram}/share-links/${id}`,
                headers: as(admin),
            })
        );
        expect(heard).toContain(linkId);
    });
});
