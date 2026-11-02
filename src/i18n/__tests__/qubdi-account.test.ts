import { describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { account } from '@/i18n/qubdi/account';
import { errorMessage, ApiError } from '@/lib/qubdi/api';

const leaves = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'string'
            ? [`${prefix}${key}`]
            : leaves(value as object, `${prefix}${key}.`)
    );

describe('qubdi.account keys', () => {
    const keys = leaves(account);

    it('has keys', () => {
        expect(keys.length).toBeGreaterThan(100);
    });

    it('resolves every key to English text, not the key itself', () => {
        for (const path of keys) {
            // plural forms are looked up by their base key plus a count
            const plural = /_(one|other)$/.test(path);
            const base = path.replace(/_(one|other)$/, '');
            const key = `qubdi.account.${base}`;
            const options = plural
                ? { count: path.endsWith('_one') ? 1 : 2 }
                : {};
            expect(i18n.exists(key, options), key).toBe(true);
            const text = i18n.t(key, options);
            expect(text, key).toBeTruthy();
            expect(text, key).not.toBe(key);
        }
    });

    it('interpolates values', () => {
        expect(
            i18n.t('qubdi.account.listPager.range', {
                from: 11,
                to: 20,
                total: 43,
                noun: 'users',
            })
        ).toBe('11–20 of 43 users');
        expect(
            i18n.t('qubdi.account.errors.requestFailed', { code: 'boom' })
        ).toBe('Request failed (boom).');
    });

    it('pluralises counts', () => {
        expect(i18n.t('qubdi.account.home.diagrams', { count: 1 })).toBe(
            '1 diagram'
        );
        expect(i18n.t('qubdi.account.home.diagrams', { count: 3 })).toBe(
            '3 diagrams'
        );
        expect(i18n.t('qubdi.account.twoFactor.codesLeft', { count: 1 })).toBe(
            'You have 1 unused recovery code.'
        );
        expect(i18n.t('qubdi.account.twoFactor.codesLeft', { count: 0 })).toBe(
            'You have 0 unused recovery codes.'
        );
    });

    it('turns server error codes into sentences', () => {
        expect(errorMessage(new ApiError(401, 'invalid_credentials'))).toBe(
            'Wrong email or password.'
        );
        expect(errorMessage(new ApiError(500, 'mystery'))).toBe(
            'Request failed (mystery).'
        );
        expect(errorMessage(new Error('x'))).toBe(
            'Could not reach the server.'
        );
    });
});
