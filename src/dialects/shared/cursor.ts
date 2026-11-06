import type { TableName } from '../script-model';
import type { Token } from './tokenizer';

/** A read position over the tokens of one statement. */
export class Cursor {
    pos = 0;

    constructor(
        readonly tokens: Token[],
        readonly source: string
    ) {}

    get done(): boolean {
        return this.pos >= this.tokens.length;
    }

    peek(offset = 0): Token | undefined {
        return this.tokens[this.pos + offset];
    }

    next(): Token | undefined {
        return this.tokens[this.pos++];
    }

    /** The token before the read position. */
    last(): Token | undefined {
        return this.tokens[this.pos - 1];
    }

    isWord(word: string, offset = 0): boolean {
        const t = this.peek(offset);
        return (
            t !== undefined &&
            t.kind === 'word' &&
            t.value.toUpperCase() === word
        );
    }

    isPunct(text: string, offset = 0): boolean {
        const t = this.peek(offset);
        return t !== undefined && t.kind === 'punct' && t.text === text;
    }

    acceptWord(word: string): boolean {
        if (!this.isWord(word)) return false;
        this.pos++;
        return true;
    }

    /** Takes the words in order, or nothing at all. */
    acceptWords(...words: string[]): boolean {
        for (let i = 0; i < words.length; i++)
            if (!this.isWord(words[i], i)) return false;
        this.pos += words.length;
        return true;
    }

    acceptPunct(text: string): boolean {
        if (!this.isPunct(text)) return false;
        this.pos++;
        return true;
    }

    /** The next token when it is a word, else undefined. */
    peekWord(offset = 0): string {
        const t = this.peek(offset);
        return t && t.kind === 'word' ? t.value.toUpperCase() : '';
    }

    /** `a`, `a.b` or `a.b.c` as a list of its parts. */
    readParts(): string[] {
        const parts: string[] = [];
        for (;;) {
            const t = this.peek();
            if (!t || (t.kind !== 'word' && t.kind !== 'ident')) break;
            parts.push(t.value);
            this.pos++;
            if (!this.isPunct('.')) break;
            this.pos++;
        }
        return parts;
    }

    /** A table name: the last two parts are schema and name. */
    readName(): TableName | undefined {
        const parts = this.readParts();
        if (parts.length === 0) return undefined;
        const name = parts[parts.length - 1];
        return parts.length > 1
            ? { schema: parts[parts.length - 2], name }
            : { name };
    }

    /** At `(`: moves past the matching `)` and returns the tokens inside. */
    readGroup(): Token[] {
        if (!this.isPunct('(')) return [];
        this.pos++;
        const start = this.pos;
        let depth = 1;
        while (!this.done) {
            const t = this.tokens[this.pos];
            if (t.kind === 'punct') {
                if (t.text === '(') depth++;
                else if (t.text === ')' && --depth === 0) break;
            }
            this.pos++;
        }
        const inner = this.tokens.slice(start, this.pos);
        this.pos++;
        return inner;
    }

    /** The original text of the tokens, as written. */
    textOf(tokens: Token[]): string {
        if (tokens.length === 0) return '';
        return this.source
            .slice(tokens[0].start, tokens[tokens.length - 1].end)
            .trim();
    }

    /** Column names in a group such as `(a, b DESC, c(10))`. */
    readNameList(): string[] {
        return splitTop(this.readGroup())
            .map((item) => item[0])
            .filter(
                (t): t is Token =>
                    !!t && (t.kind === 'word' || t.kind === 'ident')
            )
            .map((t) => t.value);
    }
}

/** Cuts tokens at commas that are not inside parentheses. */
export function splitTop(tokens: Token[]): Token[][] {
    const out: Token[][] = [];
    let current: Token[] = [];
    let depth = 0;
    for (const t of tokens) {
        if (t.kind === 'punct') {
            if (t.text === '(') depth++;
            else if (t.text === ')') depth--;
            else if (t.text === ',' && depth === 0) {
                out.push(current);
                current = [];
                continue;
            }
        }
        current.push(t);
    }
    if (current.length > 0) out.push(current);
    return out;
}
