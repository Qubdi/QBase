import { beforeEach, describe, expect, it } from 'vitest';
import type { RemoteUser } from '../api';
import { consumeAdminLanding, resetAdminLanding } from '../admin-landing';

const admin: RemoteUser = {
    id: '1',
    email: 'a@x.io',
    isAdmin: true,
    mustChangePassword: false,
};
const member: RemoteUser = {
    id: '2',
    email: 'b@x.io',
    isAdmin: false,
    mustChangePassword: false,
};

describe('admin landing', () => {
    beforeEach(() => sessionStorage.clear());

    it('sends an admin to the panel the first time only', () => {
        expect(consumeAdminLanding(admin)).toBe(true);
        expect(consumeAdminLanding(admin)).toBe(false);
    });

    it('never redirects members, anonymous or unknown users', () => {
        expect(consumeAdminLanding(member)).toBe(false);
        expect(consumeAdminLanding(null)).toBe(false);
        expect(consumeAdminLanding(undefined)).toBe(false);
        // and those checks must not use up the admin's one redirect
        expect(consumeAdminLanding(admin)).toBe(true);
    });

    it('redirects again after signing out and back in', () => {
        expect(consumeAdminLanding(admin)).toBe(true);
        resetAdminLanding();
        expect(consumeAdminLanding(admin)).toBe(true);
    });

    it('does not redirect when storage is unavailable', () => {
        const original = Object.getOwnPropertyDescriptor(
            window,
            'sessionStorage'
        )!;
        Object.defineProperty(window, 'sessionStorage', {
            configurable: true,
            get() {
                throw new Error('blocked');
            },
        });
        try {
            expect(consumeAdminLanding(admin)).toBe(false);
        } finally {
            Object.defineProperty(window, 'sessionStorage', original);
        }
    });
});
