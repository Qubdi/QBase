import { describe, expect, it } from 'vitest';
import { isValidCron, nextCronRun, parseCron } from '../src/lib/cron.js';

const at = (iso: string) => new Date(iso);
const next = (expr: string, from: string) => nextCronRun(expr, at(from))?.toISOString();

describe('parseCron / isValidCron', () => {
    it('accepts the usual forms', () => {
        for (const ok of ['* * * * *', '*/5 * * * *', '0 3 * * *', '0 0 1 1 *', '15,45 8-17 * * 1-5', '0 */6 * * *', '10-30/10 * * * *', '0 0 * * 7', '  0   3  * * *  ']) {
            expect(isValidCron(ok), ok).toBe(true);
        }
    });

    it('rejects broken ones', () => {
        for (const bad of ['', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * 32 * *', '* * * 13 *', '* * * * 8', '*/0 * * * *', '5-1 * * * *', 'a * * * *', '1,,2 * * * *', '1/2/3 * * * *', '1-2-3 * * * *', '-1 * * * *']) {
            expect(isValidCron(bad), bad).toBe(false);
        }
    });

    it('treats day of week 7 as Sunday', () => {
        expect(parseCron('0 0 * * 7').dow.values.has(0)).toBe(true);
    });

    it('explains what is wrong', () => {
        expect(() => parseCron('* * *')).toThrow(/5 fields/);
        expect(() => parseCron('61 * * * *')).toThrow(/minute must be between 0 and 59/);
    });
});

describe('nextCronRun', () => {
    it('finds the next minute for * * * * *, strictly after now', () => {
        expect(next('* * * * *', '2026-03-10T12:00:00Z')).toBe('2026-03-10T12:01:00.000Z');
        expect(next('* * * * *', '2026-03-10T12:00:30Z')).toBe('2026-03-10T12:01:00.000Z');
    });

    it('handles steps', () => {
        expect(next('*/15 * * * *', '2026-03-10T12:07:00Z')).toBe('2026-03-10T12:15:00.000Z');
        expect(next('*/15 * * * *', '2026-03-10T12:45:00Z')).toBe('2026-03-10T13:00:00.000Z');
        expect(next('0 */6 * * *', '2026-03-10T05:59:00Z')).toBe('2026-03-10T06:00:00.000Z');
    });

    it('is strictly after an exact match', () => {
        expect(next('0 3 * * *', '2026-03-10T03:00:00Z')).toBe('2026-03-11T03:00:00.000Z');
        expect(next('0 3 * * *', '2026-03-10T02:59:59Z')).toBe('2026-03-10T03:00:00.000Z');
    });

    it('rolls over days, months and years', () => {
        expect(next('0 3 * * *', '2026-03-10T04:00:00Z')).toBe('2026-03-11T03:00:00.000Z');
        expect(next('0 0 1 * *', '2026-03-10T00:00:00Z')).toBe('2026-04-01T00:00:00.000Z');
        expect(next('30 23 31 12 *', '2026-12-31T23:30:00Z')).toBe('2027-12-31T23:30:00.000Z');
        expect(next('0 0 1 1 *', '2026-06-01T00:00:00Z')).toBe('2027-01-01T00:00:00.000Z');
    });

    it('skips months that lack the day, and finds leap days', () => {
        expect(next('0 0 31 * *', '2026-04-01T00:00:00Z')).toBe('2026-05-31T00:00:00.000Z');
        expect(next('0 0 29 2 *', '2026-03-01T00:00:00Z')).toBe('2028-02-29T00:00:00.000Z');
    });

    it('matches weekdays and ranges', () => {
        // 2026-03-10 is a Tuesday
        expect(next('0 9 * * 1-5', '2026-03-13T10:00:00Z')).toBe('2026-03-16T09:00:00.000Z'); // Fri -> Mon
        expect(next('0 9 * * 0', '2026-03-10T00:00:00Z')).toBe('2026-03-15T09:00:00.000Z'); // Sunday
        expect(next('0 9 * * 7', '2026-03-10T00:00:00Z')).toBe('2026-03-15T09:00:00.000Z');
    });

    it('uses the classic OR rule when both day of month and weekday are set', () => {
        // the 15th OR any Monday: from Tue 10th, next is Mon 16th? no: the 15th (Sunday) comes first
        expect(next('0 0 15 * 1', '2026-03-10T00:00:00Z')).toBe('2026-03-15T00:00:00.000Z');
        expect(next('0 0 15 * 1', '2026-03-15T00:00:00Z')).toBe('2026-03-16T00:00:00.000Z');
    });

    it('handles lists and hour/minute combinations on the same day', () => {
        expect(next('15,45 8,20 * * *', '2026-03-10T08:20:00Z')).toBe('2026-03-10T08:45:00.000Z');
        expect(next('15,45 8,20 * * *', '2026-03-10T08:46:00Z')).toBe('2026-03-10T20:15:00.000Z');
        expect(next('15,45 8,20 * * *', '2026-03-10T20:46:00Z')).toBe('2026-03-11T08:15:00.000Z');
    });

    it('returns null for a schedule that can never happen', () => {
        expect(nextCronRun('0 0 31 2 *', at('2026-01-01T00:00:00Z'))).toBeNull();
    });

    it('throws on invalid expressions', () => {
        expect(() => nextCronRun('nope', new Date())).toThrow();
    });
});
