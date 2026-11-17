import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/qubdi/when', () => ({
    // a readable stand-in: the number of whole seconds, minutes, hours or days
    ago: (iso: string, now: Date) => {
        const s = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
        if (s < 60) return `${s}s`;
        if (s < 3600) return `${Math.floor(s / 60)}m`;
        if (s < 86400) return `${Math.floor(s / 3600)}h`;
        return `${Math.floor(s / 86400)}d`;
    },
    exactTime: (iso: string) => `exact ${iso}`,
}));

import { Ago } from './ago-time';

const START = new Date('2026-11-17T12:00:00Z');
const at = (msAgo: number) => new Date(START.getTime() - msAgo).toISOString();

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

const text = () => screen.getByRole('time').textContent;

describe('Ago', () => {
    it('shows the age, with the exact time as the tooltip', () => {
        render(<Ago iso={at(5_000)} />);
        expect(text()).toBe('5s');
        expect(screen.getByRole('time').getAttribute('title')).toContain(
            'exact'
        );
    });

    it('updates every second while it reads in seconds', () => {
        render(<Ago iso={at(5_000)} />);
        expect(text()).toBe('5s');
        // each tick comes 20 ms after the second turns
        act(() => vi.advanceTimersByTime(1_100));
        expect(text()).toBe('6s');
        act(() => vi.advanceTimersByTime(3_000));
        expect(text()).toBe('9s');
    });

    it('then updates once a minute, not every second', () => {
        render(<Ago iso={at(58_000)} />);
        act(() => vi.advanceTimersByTime(2_100));
        expect(text()).toBe('1m');
        // 30 s later it is still within the same minute: nothing has changed
        act(() => vi.advanceTimersByTime(30_000));
        expect(text()).toBe('1m');
        act(() => vi.advanceTimersByTime(31_000));
        expect(text()).toBe('2m');
    });

    it('updates hourly once it reads in hours', () => {
        render(<Ago iso={at(3_590_000)} />);
        act(() => vi.advanceTimersByTime(10_100));
        expect(text()).toBe('1h');
        act(() => vi.advanceTimersByTime(3_500_000));
        expect(text()).toBe('1h');
        act(() => vi.advanceTimersByTime(100_000));
        expect(text()).toBe('2h');
    });

    it('does not run a timer a minute-old time has no use for every second', () => {
        render(<Ago iso={at(10 * 60_000)} />);
        const spy = vi.spyOn(globalThis, 'setTimeout');
        act(() => vi.advanceTimersByTime(60_100));
        // one tick for the minute, not sixty for the seconds
        expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('rewrites at once for a new time, and stops its timer when removed', () => {
        const { rerender, unmount } = render(<Ago iso={at(5_000)} />);
        rerender(<Ago iso={at(120_000)} />);
        expect(text()).toBe('2m');
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
