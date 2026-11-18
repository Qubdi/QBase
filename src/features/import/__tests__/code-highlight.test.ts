import { describe, expect, it } from 'vitest';
import { highlight, highlightLine } from '../code-highlight';

const kinds = (line: string, language: 'sql' | 'dbml' | 'shell' = 'sql') =>
    highlightLine(line, language).spans.map((s) => `${s.kind}:${s.text}`);

describe('highlightLine', () => {
    it('gives no spans for an empty line', () => {
        expect(highlightLine('', 'sql')).toEqual({
            spans: [],
            inBlockComment: false,
        });
    });

    it('colours SQL keywords, names, functions, numbers and punctuation', () => {
        expect(kinds('SELECT count(id) FROM t;')).toEqual([
            'keyword:SELECT',
            'plain: ',
            'func:count',
            'punct:(',
            'ident:id',
            'punct:)',
            'plain: ',
            'keyword:FROM',
            'plain: ',
            'ident:t',
            'punct:;',
        ]);
        expect(kinds('12.5')).toEqual(['number:12.5']);
    });

    it('colours a -- comment to the end of the line', () => {
        expect(kinds('id int -- the key')).toEqual([
            'ident:id',
            'plain: ',
            'ident:int',
            'plain: ',
            'comment:-- the key',
        ]);
    });

    it('treats // as a comment in DBML but not in SQL', () => {
        expect(kinds('a // b', 'dbml')).toEqual([
            'ident:a',
            'plain: ',
            'comment:// b',
        ]);
        expect(kinds('a // b')).toContain('ident:b');
    });

    it('colours a block comment that closes on the same line', () => {
        expect(kinds('a /* b */ c')).toEqual([
            'ident:a',
            'plain: ',
            'comment:/* b */',
            'plain: ',
            'ident:c',
        ]);
    });

    it('carries an open block comment to the next line', () => {
        const first = highlightLine('x /* open', 'sql');
        expect(first.inBlockComment).toBe(true);
        expect(first.spans.at(-1)).toEqual({
            kind: 'comment',
            text: '/* open',
        });
        const second = highlightLine('still */ y', 'sql', true);
        expect(second.inBlockComment).toBe(false);
        expect(second.spans.map((s) => s.kind)).toEqual([
            'comment',
            'plain',
            'ident',
        ]);
        const middle = highlightLine('all comment', 'sql', true);
        expect(middle).toEqual({
            spans: [{ kind: 'comment', text: 'all comment' }],
            inBlockComment: true,
        });
    });

    it('colours single and double quoted text, closed or not', () => {
        expect(kinds(`'it''s' "x"`)).toEqual([
            "string:'it''s'",
            'plain: ',
            'string:"x"',
        ]);
        expect(kinds("'open")).toEqual(["string:'open"]);
    });

    it('colours DBML keywords and types', () => {
        expect(kinds('Table users { id integer }', 'dbml')).toEqual([
            'keyword:Table',
            'plain: ',
            'ident:users',
            'plain: ',
            'punct:{',
            'plain: ',
            'ident:id',
            'plain: ',
            'type:integer',
            'plain: ',
            'punct:}',
        ]);
    });

    it('colours short shell flags only in shell', () => {
        expect(kinds('mysqldump -u root -p db', 'shell')).toEqual([
            'ident:mysqldump',
            'plain: ',
            'flag:-u',
            'plain: ',
            'ident:root',
            'plain: ',
            'flag:-p',
            'plain: ',
            'ident:db',
        ]);
        expect(kinds('a -b')).toEqual(['ident:a', 'plain: -', 'ident:b']);
    });

    // BUG: code-highlight.ts:75-81 tests for a `--` comment before the shell
    // flag branch, for every language, so a long flag such as `--no-data`
    // (shown in the mysqldump instructions) and the rest of its line are
    // coloured as a comment in shell snippets.
    it.fails('colours a long shell flag as a flag, not a comment', () => {
        expect(kinds('mysqldump --no-data db', 'shell')).toEqual([
            'ident:mysqldump',
            'plain: ',
            'flag:--no-data',
            'plain: ',
            'ident:db',
        ]);
    });

    it('keeps unicode characters as plain text', () => {
        expect(kinds('ü')).toEqual(['plain:ü']);
    });
});

describe('highlight', () => {
    it('splits the text into lines and carries block comments', () => {
        const lines = highlight('a /* b\nc\nd */ e', 'sql');
        expect(lines).toHaveLength(3);
        expect(lines[1]).toEqual([{ kind: 'comment', text: 'c' }]);
        expect(lines[2].at(-1)).toEqual({ kind: 'ident', text: 'e' });
    });

    it('gives one empty line for empty text', () => {
        expect(highlight('', 'shell')).toEqual([[]]);
    });
});
