import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A note's text is written by any editor and shown to everyone who opens the
// diagram, admins included. react-markdown shows raw HTML as plain text unless
// rehype-raw turns it into elements, so that plugin must not come back
// without a sanitiser after it.
describe('note Markdown', () => {
    const source = readFileSync(resolve(__dirname, '../note-node.tsx'), 'utf8');

    it('does not turn raw HTML in a note into elements', () => {
        expect(source).not.toMatch(/rehype-raw|rehypeRaw/);
    });
});
