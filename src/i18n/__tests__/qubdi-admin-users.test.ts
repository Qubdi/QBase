import { describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { adminUsers } from '@/i18n/qubdi/admin-users';

const leaves = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'string'
            ? [`${prefix}${key}`]
            : leaves(value as object, `${prefix}${key}.`)
    );

describe('qubdi.adminUsers keys', () => {
    const keys = leaves(adminUsers);

    it('has keys', () => {
        expect(keys.length).toBeGreaterThan(50);
    });

    it.each(keys)('%s resolves to English text', (path) => {
        // plural keys are looked up without their suffix, with a count
        const base = path.replace(/_(one|other)$/, '');
        const full = `qubdi.adminUsers.${base}`;
        expect(i18n.exists(full, { count: 2 })).toBe(true);
        const text = i18n.t(full, { count: 2, email: 'a@b.c', query: 'q' });
        expect(text).toBeTruthy();
        expect(text).not.toBe(full);
    });

    it('interpolates values', () => {
        expect(
            i18n.t('qubdi.adminUsers.users.createdDescription', {
                email: 'a@b.c',
            })
        ).toBe('a@b.c can sign in now. Assign them to projects next.');
        expect(
            i18n.t('qubdi.adminUsers.shell.titleWithSection', {
                section: 'Users',
            })
        ).toBe('QubdiDB - Admin - Users');
    });

    it('pluralises counts', () => {
        expect(
            i18n.t('qubdi.adminUsers.users.bulkDeleteTitle', { count: 1 })
        ).toBe('Delete 1 user?');
        expect(
            i18n.t('qubdi.adminUsers.users.bulkDeleteTitle', { count: 3 })
        ).toBe('Delete 3 users?');
        expect(
            i18n.t('qubdi.adminUsers.users.leftAsTheyWere', { count: 2 })
        ).toBe('2 accounts left as they were.');
    });
});
