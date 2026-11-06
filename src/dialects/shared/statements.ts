import type { Token } from './tokenizer';

export interface Statement {
    tokens: Token[];
    /** 1-based line of the first token */
    line: number;
}

const BLOCK_OWNERS = new Set(['procedure', 'function', 'trigger']);

const upper = (t: Token | undefined): string =>
    t && t.kind === 'word' ? t.value.toUpperCase() : '';

/** True for `CREATE [OR REPLACE|ALTER] ... PROCEDURE|FUNCTION|TRIGGER`. */
function opensBlock(tokens: Token[]): boolean {
    if (upper(tokens[0]) !== 'CREATE') return false;
    return tokens
        .slice(1, 8)
        .some(
            (t) => t.kind === 'word' && BLOCK_OWNERS.has(t.value.toLowerCase())
        );
}

/**
 * Cuts the token list into statements at `;` (outside parentheses and
 * BEGIN..END blocks) and, when `goBatches` is set, at a line holding only GO.
 * Empty statements are dropped.
 */
export function splitStatements(
    tokens: Token[],
    goBatches: boolean
): Statement[] {
    const out: Statement[] = [];
    let current: Token[] = [];
    let parens = 0;
    let blocks = 0;
    let inBlockStatement = false;

    const flush = (): void => {
        if (current.length > 0)
            out.push({ tokens: current, line: current[0].line });
        current = [];
        parens = 0;
        blocks = 0;
        inBlockStatement = false;
    };

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (
            goBatches &&
            upper(t) === 'GO' &&
            parens === 0 &&
            tokens[i - 1]?.line !== t.line &&
            tokens[i + 1]?.line !== t.line
        ) {
            flush();
            continue;
        }
        current.push(t);
        if (!inBlockStatement && current.length <= 8)
            inBlockStatement = opensBlock(current);
        if (t.kind === 'punct') {
            if (t.text === '(') parens++;
            else if (t.text === ')') parens = Math.max(0, parens - 1);
            else if (t.text === ';' && parens === 0 && blocks === 0) {
                current.pop();
                flush();
            }
        } else if (inBlockStatement && t.kind === 'word') {
            const word = t.value.toUpperCase();
            if (word === 'BEGIN' || word === 'CASE') blocks++;
            else if (word === 'END' && blocks > 0) blocks--;
        }
    }
    flush();
    return out;
}

/**
 * PostgreSQL dumps carry table data after `COPY ... FROM stdin;` up to a line
 * that is `\.`. The rows are blanked (line breaks stay) so they are not lexed.
 */
export function blankCopyData(text: string): string {
    const lines = text.split('\n');
    let skipping = false;
    for (let i = 0; i < lines.length; i++) {
        if (skipping) {
            if (lines[i].trim() === '\\.') skipping = false;
            lines[i] = '';
        } else if (/^\s*COPY\b.*\bFROM\s+stdin\b/i.test(lines[i])) {
            skipping = true;
        }
    }
    return lines.join('\n');
}
