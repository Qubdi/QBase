import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityChart } from '../activity-chart';

const week = (events: number[], last = '2026-10-16') => {
    const end = Date.parse(`${last}T00:00:00Z`);
    return events.map((n, i) => ({
        day: new Date(end - (events.length - 1 - i) * 86_400_000)
            .toISOString()
            .slice(0, 10),
        events: n,
    }));
};

const DAYS = week([3, 0, 12, 7, 0, 5, 9]); // 2026-10-10 .. 2026-10-16
const TODAY = '2026-10-16';

const column = (name: RegExp) => screen.getByRole('button', { name });

describe('ActivityChart', () => {
    it('is named by its title and says what is plotted, with no legend box', () => {
        render(<ActivityChart days={DAYS} today={TODAY} />);
        expect(
            screen.getByRole('region', { name: 'Activity, last 7 days' })
        ).toBeTruthy();
        expect(
            screen.getByText('Events per day. Saves are not counted.')
        ).toBeTruthy();
    });

    it('has one column to focus for each day, saying its day and count', () => {
        render(<ActivityChart days={DAYS} today={TODAY} />);
        const buttons = screen
            .getAllByRole('button')
            .filter((b) => /event/.test(b.getAttribute('aria-label') ?? ''));
        expect(buttons).toHaveLength(7);
        expect(buttons[2].getAttribute('aria-label')).toMatch(/12 events/);
        expect(buttons[0].getAttribute('aria-label')).toMatch(/3 events/);
        expect(buttons[1].getAttribute('aria-label')).toMatch(/0 events/);
    });

    it('says "1 event", not "1 events"', () => {
        render(
            <ActivityChart days={week([1, 0, 0, 0, 0, 0, 0])} today={TODAY} />
        );
        expect(
            screen
                .getAllByRole('button')
                .some((b) =>
                    /: 1 event$/.test(b.getAttribute('aria-label') ?? '')
                )
        ).toBe(true);
    });

    describe('the axis', () => {
        it('tops out at a clean number above the busiest day, with a tick in the middle', () => {
            const { container } = render(
                <ActivityChart days={DAYS} today={TODAY} />
            );
            // busiest 12 -> axis to 20: ticks 0, 10, 20
            const ticks = Array.from(
                container.querySelectorAll('span.tabular-nums')
            ).map((s) => s.textContent);
            expect(ticks).toEqual(['0', '10', '20']);
        });

        it('has a scale even when nothing happened', () => {
            const { container } = render(
                <ActivityChart
                    days={week([0, 0, 0, 0, 0, 0, 0])}
                    today={TODAY}
                />
            );
            const ticks = Array.from(
                container.querySelectorAll('span.tabular-nums')
            ).map((s) => s.textContent);
            expect(ticks).toEqual(['0', '2', '4']);
            expect(
                screen.getByText('Nothing has happened in the last 7 days.')
            ).toBeTruthy();
        });
    });

    describe('column heights', () => {
        const heights = (container: HTMLElement) =>
            Array.from(container.querySelectorAll('button > span[aria-hidden]'))
                .filter((s) => (s as HTMLElement).style.height !== '')
                .map((s) => (s as HTMLElement).style.height);

        it('are a share of the axis, and empty for a day with nothing', () => {
            const { container } = render(
                <ActivityChart days={DAYS} today={TODAY} />
            );
            // axis to 20: 3 -> 15%, 0 -> 0%, 12 -> 60%, 7 -> 35%
            expect(heights(container)).toEqual([
                '15%',
                '0%',
                '60%',
                '35%',
                '0%',
                '25%',
                '45%',
            ]);
        });

        it('keep a day with a few events visible beside a very busy one', () => {
            const { container } = render(
                <ActivityChart
                    days={week([1, 0, 0, 0, 0, 0, 900])}
                    today={TODAY}
                />
            );
            const first = container.querySelector(
                'button > span[aria-hidden]'
            ) as HTMLElement;
            expect(first.style.minHeight).toBe('2px');
        });
    });

    describe('hover and focus', () => {
        it('shows nothing until a column is pointed at', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            expect(screen.queryByRole('tooltip')).toBeNull();
        });

        it('shows the count first and the day after, for the column pointed at', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            fireEvent.mouseEnter(column(/12 events/));
            const tip = screen.getByRole('tooltip');
            expect(within(tip).getByText('12 events')).toBeTruthy();
            expect(tip.textContent).toMatch(/2026/);
            expect(tip.textContent).toMatch(/12/);
        });

        it('goes away when the pointer leaves', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            fireEvent.mouseEnter(column(/12 events/));
            fireEvent.mouseLeave(column(/12 events/));
            expect(screen.queryByRole('tooltip')).toBeNull();
        });

        it('shows the same on keyboard focus, and hides on blur', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            fireEvent.focus(column(/7 events/));
            expect(
                within(screen.getByRole('tooltip')).getByText('7 events')
            ).toBeTruthy();
            fireEvent.blur(column(/7 events/));
            expect(screen.queryByRole('tooltip')).toBeNull();
        });

        it('is for one column at a time', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            fireEvent.mouseEnter(column(/12 events/));
            fireEvent.mouseEnter(column(/9 events/));
            expect(screen.getAllByRole('tooltip')).toHaveLength(1);
            expect(
                within(screen.getByRole('tooltip')).getByText('9 events')
            ).toBeTruthy();
        });

        it('opens on a day with nothing too, so every day can be asked', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            fireEvent.mouseEnter(
                screen.getAllByRole('button', { name: /0 events/ })[0]
            );
            expect(
                within(screen.getByRole('tooltip')).getByText('0 events')
            ).toBeTruthy();
        });
    });

    describe('the busiest day', () => {
        it('is labelled on its column, and only that one', () => {
            const { container } = render(
                <ActivityChart days={DAYS} today={TODAY} />
            );
            const labels = Array.from(
                container.querySelectorAll('button span.font-medium')
            ).map((s) => s.textContent);
            expect(labels).toEqual(['12']);
        });

        it('is not labelled when the week was empty', () => {
            const { container } = render(
                <ActivityChart
                    days={week([0, 0, 0, 0, 0, 0, 0])}
                    today={TODAY}
                />
            );
            expect(
                container.querySelectorAll('button span.font-medium')
            ).toHaveLength(0);
        });

        it("is named in the summary under the chart, with the week's total", () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            // 3 + 0 + 12 + 7 + 0 + 5 + 9
            expect(
                screen.getByText(/36 events in 7 days, busiest on .*\(12\)\./)
            ).toBeTruthy();
        });
    });

    describe('days along the bottom', () => {
        it('call today "Today" and give a date to every day', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            expect(screen.getByText('Today')).toBeTruthy();
            expect(screen.getAllByText(/\d/).length).toBeGreaterThan(7);
        });
    });

    describe('the table view', () => {
        it('lists every day and its count, with today marked', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            fireEvent.click(screen.getByRole('button', { name: 'Table' }));

            const table = screen.getByRole('table', { name: 'Events per day' });
            const rows = within(table).getAllByRole('row');
            // a header and seven days
            expect(rows).toHaveLength(8);
            expect(within(rows[3]).getByText('12')).toBeTruthy();
            expect(within(table).getByText('today')).toBeTruthy();
            expect(screen.queryByRole('tooltip')).toBeNull();
        });

        it('swaps back to the chart', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            fireEvent.click(screen.getByRole('button', { name: 'Table' }));
            fireEvent.click(screen.getByRole('button', { name: 'Chart' }));
            expect(screen.queryByRole('table')).toBeNull();
            expect(column(/12 events/)).toBeTruthy();
        });

        it('says which view is showing', () => {
            render(<ActivityChart days={DAYS} today={TODAY} />);
            expect(
                screen
                    .getByRole('button', { name: 'Chart' })
                    .getAttribute('aria-pressed')
            ).toBe('true');
            fireEvent.click(screen.getByRole('button', { name: 'Table' }));
            expect(
                screen
                    .getByRole('button', { name: 'Table' })
                    .getAttribute('aria-pressed')
            ).toBe('true');
            expect(
                screen
                    .getByRole('button', { name: 'Chart' })
                    .getAttribute('aria-pressed')
            ).toBe('false');
        });
    });
});
