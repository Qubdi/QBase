import { describe, expect, it } from 'vitest';
import {
    busiestDay,
    compactNumber,
    dayLabel,
    heightPercent,
    MIN_AXIS_MAX,
    niceCeil,
    plural,
    scaleFor,
} from '../overview';

describe('niceCeil', () => {
    it.each([
        [0, 4],
        [1, 4],
        [4, 4],
        [5, 6],
        [6, 6],
        [7, 8],
        [8, 8],
        [9, 10],
        [10, 10],
        [11, 20],
        [20, 20],
        [21, 40],
        [41, 60],
        [61, 80],
        [81, 100],
        [101, 200],
        [450, 600],
        [9_001, 10_000],
        [12_345, 20_000],
    ])('%i needs an axis up to %i', (value, expected) => {
        expect(niceCeil(value)).toBe(expected);
    });

    it('always holds the value it was given', () => {
        for (let v = 0; v <= 3_000; v += 7) {
            expect(niceCeil(v)).toBeGreaterThanOrEqual(v);
        }
    });

    it('always gives an even number, so the middle tick is whole', () => {
        for (let v = 0; v <= 5_000; v += 13) {
            expect(niceCeil(v) % 2).toBe(0);
        }
    });

    it('never wastes more than half the plot on a week that has data', () => {
        for (let v = MIN_AXIS_MAX; v <= 5_000; v += 3) {
            expect(v / niceCeil(v)).toBeGreaterThan(0.45);
        }
    });
});

describe('scaleFor', () => {
    it('puts ticks at the bottom, the middle and the top', () => {
        expect(scaleFor([3, 7, 5])).toEqual({ max: 8, ticks: [0, 4, 8] });
        expect(scaleFor([37])).toEqual({ max: 40, ticks: [0, 20, 40] });
    });

    it('still has a scale when nothing happened', () => {
        expect(scaleFor([0, 0, 0])).toEqual({ max: 4, ticks: [0, 2, 4] });
        expect(scaleFor([])).toEqual({ max: 4, ticks: [0, 2, 4] });
    });
});

describe('heightPercent', () => {
    const scale = scaleFor([8]);
    it('is a share of the plot', () => {
        expect(heightPercent(0, scale)).toBe(0);
        expect(heightPercent(4, scale)).toBe(50);
        expect(heightPercent(8, scale)).toBe(100);
    });

    it('never rises above the top of the plot', () => {
        expect(heightPercent(80, scale)).toBe(100);
    });
});

describe('compactNumber', () => {
    it.each([
        [0, '0'],
        [7, '7'],
        [1_284, '1,284'],
        [9_999, '9,999'],
        [10_000, '10K'],
        [12_900, '12.9K'],
        [1_200_000, '1.2M'],
    ])('%i is %s', (value, expected) => {
        expect(compactNumber(value)).toBe(expected);
    });
});

describe('plural', () => {
    it('counts and names', () => {
        expect(plural(1, 'admin')).toBe('1 admin');
        expect(plural(2, 'admin')).toBe('2 admins');
        expect(plural(0, 'admin')).toBe('0 admins');
        expect(plural(12_900, 'user')).toBe('12.9K users');
        expect(plural(2, 'person', 'people')).toBe('2 people');
    });
});

describe('dayLabel', () => {
    it("names a day by its own parts, whatever the viewer's zone", () => {
        const label = dayLabel('2026-10-16', '2026-10-16');
        expect(label.date).toMatch(/16/);
        expect(label.full).toMatch(/2026/);
        expect(label.weekday.length).toBeGreaterThan(1);
        // 2026-10-16 is a Friday
        expect(label.weekday).toMatch(/fri/i);
    });

    it('knows which day is today', () => {
        expect(dayLabel('2026-10-16', '2026-10-16').isToday).toBe(true);
        expect(dayLabel('2026-10-15', '2026-10-16').isToday).toBe(false);
    });

    it('does not slip a day at a month or year boundary', () => {
        expect(dayLabel('2026-01-01', '2026-01-01').date).toMatch(/1/);
        expect(dayLabel('2025-12-31', '2026-01-01').full).toMatch(/2025/);
        expect(dayLabel('2024-02-29', '2024-02-29').date).toMatch(/29/);
    });
});

describe('busiestDay', () => {
    it('is the day with the most events', () => {
        expect(
            busiestDay([
                { day: '2026-10-10', events: 3 },
                { day: '2026-10-11', events: 9 },
                { day: '2026-10-12', events: 4 },
            ])
        ).toEqual({ day: '2026-10-11', events: 9 });
    });

    it('is the first when several tie, and none for an empty week', () => {
        expect(
            busiestDay([
                { day: '2026-10-10', events: 5 },
                { day: '2026-10-11', events: 5 },
            ])?.day
        ).toBe('2026-10-10');
        expect(
            busiestDay([
                { day: '2026-10-10', events: 0 },
                { day: '2026-10-11', events: 0 },
            ])
        ).toBeNull();
        expect(busiestDay([])).toBeNull();
    });
});
