import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Regressions found by the axe audit (tools/e2e/a11y.mjs).
const source = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('page structure', () => {
    const frame = source('../editor-frame.tsx');
    it('the editor has one level-one heading and no second main landmark', () => {
        expect(frame).toMatch(/<h1 className="sr-only">/);
        expect(frame).not.toMatch(/<main\b/);
    });
    it('the pages sit inside the one main landmark of index.html, not in a second', () => {
        for (const page of [
            '../../pages/home-page/home-page.tsx',
            '../../pages/admin-page/admin-page.tsx',
            '../../platform/router/not-found-page.tsx',
        ])
            expect(source(page)).not.toMatch(/<main\b/);
    });
    it('the side panel has a level-two heading before its sections', () => {
        expect(source('../side-panel-slot.tsx')).toMatch(
            /<h2 className="sr-only">/
        );
    });
});
