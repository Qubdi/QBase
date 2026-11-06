import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The reduced-motion rule applies to every element. Giving every element a tiny
// transition duration makes it transition every property by default (the default
// transition-property is `all`), including a relationship line's shape `d`, so the
// line froze and jumped while a table was dragged for people with reduced motion on.
const css = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');
const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
const rule = block.slice(0, block.indexOf('}') + 1);

describe('reduced-motion CSS', () => {
    it('exists', () => {
        expect(rule).toContain('prefers-reduced-motion');
    });

    it('turns transitions off instead of shortening them', () => {
        expect(rule).toMatch(/transition:\s*none\s*!important/);
        expect(rule).not.toMatch(/transition-duration/);
    });
});
