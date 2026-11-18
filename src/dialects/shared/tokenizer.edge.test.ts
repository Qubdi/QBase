import { describe, expect, it } from 'vitest';
import { lex } from './tokenizer';
import type { LexProfile } from './tokenizer';

const PG: LexProfile = {
    identifierQuotes: ['"'],
    hashComments: false,
    dollarStrings: true,
    backslashEscapes: false,
};
const MYSQL: LexProfile = {
    identifierQuotes: ['`'],
    hashComments: true,
    dollarStrings: false,
    backslashEscapes: true,
};
const MSSQL: LexProfile = {
    identifierQuotes: ['[', '"'],
    hashComments: false,
    dollarStrings: false,
    backslashEscapes: false,
};

const kinds = (text: string, profile: LexProfile) =>
    lex(text, profile).tokens.map((t) => `${t.kind}:${t.value}`);

describe('lex: empty and blank input', () => {
    it('gives no tokens and no problems for empty text', () => {
        expect(lex('', PG)).toEqual({ tokens: [], problems: [] });
    });

    it('gives no tokens for whitespace and comments only', () => {
        expect(lex('  \n\t -- note\n/* block */\n', PG)).toEqual({
            tokens: [],
            problems: [],
        });
    });
});

describe('lex: comments', () => {
    it('drops a line comment that runs to the end of the text', () => {
        expect(kinds('a -- tail without newline', PG)).toEqual(['word:a']);
    });

    it('treats # as a comment only when the profile says so', () => {
        expect(kinds('a # note\nb', MYSQL)).toEqual(['word:a', 'word:b']);
        expect(kinds('a # note', MYSQL)).toEqual(['word:a']);
        expect(kinds('a # b', PG)).toEqual(['word:a', 'punct:#', 'word:b']);
    });

    it('reads #temp as a word where # is not a comment', () => {
        expect(kinds('#temp', MSSQL)).toEqual(['word:#temp']);
        expect(kinds('@var', MSSQL)).toEqual(['word:@var']);
    });

    it('reports an unterminated block comment with its position', () => {
        const r = lex('a\n  /* open', PG);
        expect(r.tokens.map((t) => t.value)).toEqual(['a']);
        expect(r.problems).toEqual([
            {
                severity: 'error',
                message: 'Unterminated block comment',
                line: 2,
                column: 3,
            },
        ]);
    });

    it('keeps counting lines inside a block comment', () => {
        const r = lex('/* one\ntwo\nthree */ x', PG);
        expect(r.tokens[0]).toMatchObject({ value: 'x', line: 3, column: 10 });
    });
});

describe('lex: strings', () => {
    it('reads a doubled quote as one quote', () => {
        expect(kinds("'it''s'", PG)).toEqual(["string:it's"]);
    });

    it('reads a backslash escape when the profile has them', () => {
        expect(kinds("'it\\'s'", MYSQL)).toEqual(["string:it's"]);
    });

    it('reads a backslash escape in a PostgreSQL E-string only', () => {
        expect(kinds("E'it\\'s'", PG)).toEqual(['word:E', "string:it's"]);
        expect(kinds("e'a\\nb'", PG)).toEqual(['word:e', 'string:anb']);
        // a word ending in e is not an E prefix
        expect(kinds("type'a\\'", PG)).toEqual(['word:type', 'string:a\\']);
    });

    it('reports unterminated quoted text', () => {
        const r = lex("x 'open", PG);
        expect(r.tokens[1]).toMatchObject({ kind: 'string', value: 'open' });
        expect(r.problems[0]).toMatchObject({
            message: 'Unterminated quoted text',
            column: 3,
        });
    });

    it('keeps a trailing backslash at the very end of an open string', () => {
        const r = lex("'a\\", MYSQL);
        expect(r.tokens[0].value).toBe('a\\');
        expect(r.problems).toHaveLength(1);
    });
});

describe('lex: dollar-quoted strings', () => {
    it('reads $$ ... $$ and $tag$ ... $tag$ as one string', () => {
        expect(kinds("$$ it's; $$", PG)).toEqual(["string: it's; "]);
        expect(kinds('$body$ a $$ b $body$ x', PG)).toEqual([
            'string: a $$ b ',
            'word:x',
        ]);
    });

    it('reports an unterminated dollar string and takes the rest', () => {
        const r = lex('$f$ never closed', PG);
        expect(r.tokens).toHaveLength(1);
        expect(r.tokens[0].value).toBe(' never closed');
        expect(r.problems[0].message).toBe('Unterminated quoted text');
    });

    it('reads $ as punctuation when dollar strings are off or no tag follows', () => {
        expect(kinds('$$', MSSQL)).toEqual(['punct:$', 'punct:$']);
        expect(kinds('$1', PG)).toEqual(['punct:$', 'number:1']);
    });

    // BUG: PostgreSQL allows digits in a dollar tag after its first character
    // ($q1$), but the tag pattern is /^\$[A-Za-z_]*\$/, so `$q1$` is not
    // recognised and the body is lexed as code.
    it.fails('reads a tag with a digit ($q1$) as one string', () => {
        expect(kinds('$q1$ ; $q1$', PG)).toEqual(['string: ; ']);
    });
});

describe('lex: quoted identifiers', () => {
    it('reads "a""b", `a``b` and [a]]b] with their escapes', () => {
        expect(kinds('"a""b"', PG)).toEqual(['ident:a"b']);
        expect(kinds('`a``b`', MYSQL)).toEqual(['ident:a`b']);
        expect(kinds('[a]]b]', MSSQL)).toEqual(['ident:a]b']);
    });

    it('keeps spaces, dots and unicode inside quotes', () => {
        expect(kinds('[my table].[ünï code]', MSSQL)).toEqual([
            'ident:my table',
            'punct:.',
            'ident:ünï code',
        ]);
    });

    it('reports an unterminated identifier', () => {
        for (const [text, profile] of [
            ['"open', PG],
            ['`open', MYSQL],
            ['[open', MSSQL],
        ] as const) {
            const r = lex(text, profile);
            expect(r.tokens[0].kind).toBe('ident');
            expect(r.problems[0].message).toBe('Unterminated quoted text');
        }
    });

    it('treats a quote character the profile does not know as punctuation', () => {
        expect(kinds('[a]', PG)).toEqual(['punct:[', 'word:a', 'punct:]']);
        expect(kinds('`a`', PG)).toEqual(['punct:`', 'word:a', 'punct:`']);
    });
});

describe('lex: numbers, words and operators', () => {
    it('reads integers, decimals, leading-dot numbers and exponents', () => {
        expect(kinds('1 2.5 .5 1e10 3.0E-2 7.', PG)).toEqual([
            'number:1',
            'number:2.5',
            'number:.5',
            'number:1e10',
            'number:3.0E-2',
            'number:7.',
        ]);
    });

    it('reads a lone dot as punctuation', () => {
        expect(kinds('a.b', PG)).toEqual(['word:a', 'punct:.', 'word:b']);
    });

    it('reads unicode words and $ inside a word', () => {
        expect(kinds('ünï идентификатор a$b', PG)).toEqual([
            'word:ünï',
            'word:идентификатор',
            'word:a$b',
        ]);
    });

    it('reads two-character operators as one token', () => {
        expect(
            kinds('a::int <> b || c != d >= e <= f -> g => h := i', PG)
        ).toEqual([
            'word:a',
            'punct:::',
            'word:int',
            'punct:<>',
            'word:b',
            'punct:||',
            'word:c',
            'punct:!=',
            'word:d',
            'punct:>=',
            'word:e',
            'punct:<=',
            'word:f',
            'punct:->',
            'word:g',
            'punct:=>',
            'word:h',
            'punct::=',
            'word:i',
        ]);
    });

    it('keeps offsets that cut the original text', () => {
        const text = 'CREATE  TABLE "x y"\n( id int )';
        for (const t of lex(text, PG).tokens)
            expect(text.slice(t.start, t.end)).toBe(t.text);
    });

    it('gives line and column of each token', () => {
        const [a, b] = lex('a\n   b', PG).tokens;
        expect([a.line, a.column, b.line, b.column]).toEqual([1, 1, 2, 4]);
    });
});

describe('lex: nested block comments', () => {
    // BUG: PostgreSQL (and SQL Server) nest block comments, but the lexer
    // closes the comment at the first `*/`, so `still comment */` is lexed
    // as code (a word, `*` and `/`).
    it.fails('drops a nested block comment as a whole', () => {
        expect(kinds('/* a /* b */ still comment */ x', PG)).toEqual([
            'word:x',
        ]);
    });
});
