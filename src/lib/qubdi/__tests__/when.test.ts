import { describe, expect, it } from 'vitest';
import { ago, exactTime } from '../when';

const now = new Date('2026-10-16T12:00:00.000Z');
const before = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('ago', () => {
    it('says how long ago, relative to the time given', () => {
        expect(ago(before(5_000), now)).toBe('just now');
        expect(ago(before(3 * 60_000), now)).toBe('3 minutes ago');
        expect(ago(before(3 * 3_600_000), now)).toBe('3 hours ago');
        expect(ago(before(2 * 86_400_000), now)).toBe('2 days ago');
    });

    it('does not depend on the time zone', () => {
        // 11:57 UTC written with another offset is the same moment
        expect(ago('2026-10-16T13:57:00.000+02:00', now)).toBe('3 minutes ago');
    });
});

describe('exactTime', () => {
    it('shows the full date and time for a tooltip', () => {
        const text = exactTime('2026-10-16T12:34:56.000Z');
        expect(text).toMatch(/2026/);
        expect(text.length).toBeGreaterThan(10);
    });
});
