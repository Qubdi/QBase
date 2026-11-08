import { describe, expect, it } from 'vitest';
import { buildEdges, NO_LIVE } from './flow-model';
import { shop } from './test/fixtures';

const input = (design: ReturnType<typeof shop>['design'], pick: string[]) => ({
    design,
    selection: new Set(pick),
    visible: new Set(design.entities.order),
    live: NO_LIVE,
    flashing: new Set<string>(),
    overlapping: new Set<string>(),
    sizes: {},
    outlineOverlaps: false,
    editable: true,
});

describe('EDT-032 a line stands back with its table', () => {
    it('is not dimmed when nothing is selected', () => {
        const s = shop();
        expect(buildEdges(input(s.design, []))[0].data?.dimmed).toBe(false);
    });

    it('is not dimmed when it touches the selected table', () => {
        const s = shop();
        expect(buildEdges(input(s.design, [s.users]))[0].data?.dimmed).toBe(
            false
        );
    });

    it('is dimmed when a table at one end stands back', () => {
        const s = shop();
        // items has no link to users or orders, so both of them stand back
        expect(buildEdges(input(s.design, [s.items]))[0].data?.dimmed).toBe(
            true
        );
    });
});
