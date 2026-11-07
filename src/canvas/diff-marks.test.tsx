import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { apply } from '@/core/commands/apply';
import { createEntityParts } from '@/core/model/defaults';
import { NOW, rng } from '@/core/testing/helpers';
import type { DiffMarks } from './diff-marks';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';

function marked() {
    const s = shop();
    const parts = createEntityParts(s.design, {
        name: 'fresh',
        x: 700,
        y: 0,
        now: NOW,
        random: rng(41),
    });
    const result = apply(s.design, { type: 'entity.insert', parts });
    if (!result.ok) throw new Error(result.message);
    const diff: DiffMarks = {
        design: result.design,
        tables: {
            [parts.entity.id]: 'added',
            [s.users]: 'removed',
            [s.orders]: 'changed',
        },
        links: { [s.link]: 'added' },
    };
    return { s, diff, fresh: parts.entity.id };
}

describe('EDT-242 EDT-243 diff marks on the canvas', () => {
    it('draws a badge and a coloured name on marked tables, with tooltips', async () => {
        const { s, diff, fresh } = marked();
        renderCanvas(s.design, { canvas: { hooks: { diff } } });
        const added = await screen.findByTestId(`diff-badge-${fresh}`);
        expect(added.getAttribute('data-diff')).toBe('added');
        expect(added.getAttribute('title')).toBe('New Table');
        expect(
            screen.getByTestId(`diff-badge-${s.users}`).getAttribute('title')
        ).toBe('Table Removed');
        expect(
            screen.getByTestId(`diff-badge-${s.orders}`).getAttribute('title')
        ).toBe('Table Changed');
        expect(screen.queryByTestId(`diff-badge-${s.items}`)).toBeNull();
        const name = document.querySelector(
            `[data-testid="entity-${fresh}"] [data-diff-name]`
        )!;
        expect(name.className).toContain('text-green-600');
        expect(name.textContent).toBe('fresh');
    });

    it('draws marked relationships thicker in green', async () => {
        const { s, diff } = marked();
        const { container } = renderCanvas(s.design, {
            canvas: { hooks: { diff } },
        });
        await waitFor(() => {
            const path = container.querySelector(
                '.react-flow__edge path[data-diff="added"]'
            );
            expect(path).toBeTruthy();
            expect(path!.getAttribute('style')).toContain('stroke-width: 3');
            expect(path!.getAttribute('style')).toContain('#16a34a');
        });
    });

    it('marks nothing and keeps the store design without a diff', async () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        await screen.findByTestId(`entity-${s.users}`);
        expect(document.querySelector('[data-diff]')).toBeNull();
        expect(store.getState().design).toBe(s.design);
    });
});
