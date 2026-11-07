import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Regressions found by the axe audit (tools/e2e/a11y.mjs, rewrite/phase9/a11y.md).
const source = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('page structure', () => {
    const frame = source('../editor-frame.tsx');
    it('the editor has one level-one heading and no second main landmark', () => {
        expect(frame).toMatch(/<h1 className="sr-only">/);
        expect(frame).not.toMatch(/<main\b/);
    });
    it('the side panel has a level-two heading before its sections', () => {
        expect(source('../side-panel-slot.tsx')).toMatch(
            /<h2 className="sr-only">/
        );
    });
});
