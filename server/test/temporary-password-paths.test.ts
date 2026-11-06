import { describe, expect, it } from 'vitest';
import { isOpenToTemporaryPassword } from '../src/app.js';

describe('isOpenToTemporaryPassword', () => {
    it('keeps the sign-in and password routes open', () => {
        for (const p of ['/health', '/auth/me', '/auth/change-password', '/auth/logout']) {
            expect(isOpenToTemporaryPassword(p)).toBe(true);
        }
    });

    it('opens the public share pages and their live stream', () => {
        expect(isOpenToTemporaryPassword('/s/abc123')).toBe(true);
        expect(isOpenToTemporaryPassword('/s/abc123/events')).toBe(true);
    });

    it('keeps everything else closed, including look-alikes', () => {
        for (const p of ['/diagrams', '/projects', '/admin/users', '/share-links', '/s', '/sx/abc', '/diagrams/s/abc']) {
            expect(isOpenToTemporaryPassword(p)).toBe(false);
        }
    });
});
