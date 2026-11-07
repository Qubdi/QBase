import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';
import { holdFullRender } from './capture-mode';

describe('export draws every table (review ui 1)', () => {
    it('a table far outside the window is drawn while an export holds the switch', async () => {
        const s = shop();
        const design = {
            ...s.design,
            entities: {
                ...s.design.entities,
                byId: {
                    ...s.design.entities.byId,
                    [s.items]: {
                        ...s.design.entities.byId[s.items],
                        x: 90000,
                        y: 90000,
                    },
                },
            },
        };
        const { container } = renderCanvas(design);
        const drawn = () =>
            container.querySelectorAll(`[data-id="${s.items}"]`).length;
        await act(async () => undefined);
        expect(drawn()).toBe(0);
        let release = () => undefined as void;
        act(() => {
            release = holdFullRender();
        });
        expect(drawn()).toBe(1);
        act(() => release());
        expect(drawn()).toBe(0);
    });
});
