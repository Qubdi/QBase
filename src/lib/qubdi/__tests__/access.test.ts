import { describe, expect, it } from 'vitest';
import type { RemoteDiagramSummary } from '../api';
import { isLocked, lockedReason, resolveAccess } from '../access';

const summary = (
    id: string,
    role: RemoteDiagramSummary['role'],
    projectId: string | null = 'p1'
): RemoteDiagramSummary => ({
    id,
    title: id,
    updatedAt: '2025-01-01T00:00:00.000Z',
    ownerId: 'u1',
    projectId,
    role,
});

describe('resolveAccess', () => {
    it('treats a diagram with no server copy as unbound', () => {
        expect(resolveAccess(undefined, [summary('r1', 'editor')])).toEqual({
            status: 'unbound',
        });
    });

    it('gives editors and admins edit access, with the project', () => {
        for (const role of ['editor', 'owner'] as const) {
            expect(resolveAccess('r1', [summary('r1', role, 'pX')])).toEqual({
                status: 'editor',
                projectId: 'pX',
                remoteId: 'r1',
            });
        }
    });

    it('gives viewers read-only access', () => {
        expect(resolveAccess('r1', [summary('r1', 'viewer')])).toMatchObject({
            status: 'viewer',
            projectId: 'p1',
        });
    });

    it('reports access lost when the server no longer lists the diagram', () => {
        expect(resolveAccess('r1', [summary('other', 'editor')])).toEqual({
            status: 'lost',
        });
        expect(resolveAccess('r1', [])).toEqual({ status: 'lost' });
    });

    it('never grants edit access to a diagram without a project', () => {
        expect(resolveAccess('r1', [summary('r1', 'editor', null)])).toEqual({
            status: 'lost',
        });
    });
});

describe('isLocked', () => {
    it('locks everything except edit access and local mode', () => {
        expect(isLocked({ status: 'unbound' })).toBe(true);
        expect(isLocked({ status: 'no_diagram', projectId: 'p' })).toBe(true);
        expect(isLocked({ status: 'lost' })).toBe(true);
        expect(isLocked({ status: 'error' })).toBe(true);
        expect(
            isLocked({ status: 'viewer', projectId: 'p', remoteId: 'r' })
        ).toBe(true);
        expect(
            isLocked({ status: 'editor', projectId: 'p', remoteId: 'r' })
        ).toBe(false);
        expect(isLocked({ status: 'off' })).toBe(false);
    });
});

describe('lockedReason', () => {
    it('explains each locked state and stays silent otherwise', () => {
        expect(lockedReason({ status: 'unbound' })).toMatch(/not in a project/);
        expect(lockedReason({ status: 'lost' })).toMatch(
            /no longer have access/
        );
        expect(lockedReason({ status: 'error' })).toMatch(/reach the server/);
        expect(
            lockedReason(
                { status: 'viewer', projectId: 'p', remoteId: 'r' },
                'Billing'
            )
        ).toMatch(/view-only access to Billing/);
        // no banner while the user is still choosing a diagram
        expect(
            lockedReason({ status: 'no_diagram', projectId: 'p' })
        ).toBeNull();
        expect(lockedReason({ status: 'off' })).toBeNull();
        expect(
            lockedReason({ status: 'editor', projectId: 'p', remoteId: 'r' })
        ).toBeNull();
    });
});
