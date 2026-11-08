/** Colour classes of a piece of code. The page maps them to colours (light and dark). */
export type CodeKind =
    | 'plain'
    | 'keyword'
    | 'string'
    | 'comment'
    | 'number'
    | 'func'
    | 'ident'
    | 'flag'
    | 'type'
    | 'punct';

export interface CodeSpan {
    kind: CodeKind;
    text: string;
}

export type CodeLanguage = 'sql' | 'dbml' | 'shell';

const SQL_WORDS = new Set(
    (
        'select from where with as and or not null case when then else end join left right inner outer on ' +
        'group by order having limit union all distinct insert into values update set delete create table ' +
        'view index primary key foreign references default unique check constraint alter drop if exists ' +
        'is in like between asc desc over using returning'
    ).split(' ')
);
const DBML_WORDS = new Set(
    'table ref enum indexes note project tablegroup as'.split(' ')
);
const DBML_TYPES = new Set(
    'int integer bigint smallint varchar char text boolean bool date datetime timestamp float double decimal numeric uuid json jsonb'.split(
        ' '
    )
);

const WORD = /[A-Za-z_][A-Za-z0-9_]*/y;

/** Splits one line into coloured spans. Small on purpose: it colours, it does not parse. */
export function highlightLine(
    line: string,
    language: CodeLanguage,
    inBlockComment = false
): { spans: CodeSpan[]; inBlockComment: boolean } {
    const spans: CodeSpan[] = [];
    const push = (kind: CodeKind, text: string) => {
        if (text === '') return;
        const last = spans[spans.length - 1];
        if (last && last.kind === kind) last.text += text;
        else spans.push({ kind, text });
    };
    let i = 0;
    let block = inBlockComment;
    while (i < line.length) {
        if (block) {
            const end = line.indexOf('*/', i);
            if (end < 0) {
                push('comment', line.slice(i));
                i = line.length;
            } else {
                push('comment', line.slice(i, end + 2));
                i = end + 2;
                block = false;
            }
            continue;
        }
        const rest = line.slice(i);
        if (rest.startsWith('/*')) {
            block = true;
            push('comment', '/*');
            i += 2;
            continue;
        }
        if (
            rest.startsWith('--') ||
            (language !== 'sql' && rest.startsWith('//'))
        ) {
            push('comment', rest);
            break;
        }
        const ch = line[i];
        if (ch === "'" || ch === '"') {
            let j = i + 1;
            while (j < line.length && line[j] !== ch) j++;
            push('string', line.slice(i, Math.min(j + 1, line.length)));
            i = j + 1;
            continue;
        }
        if (/[0-9]/.test(ch)) {
            const m = /^[0-9][0-9.]*/.exec(rest)!;
            push('number', m[0]);
            i += m[0].length;
            continue;
        }
        if (language === 'shell' && ch === '-' && /^-[A-Za-z-]/.test(rest)) {
            const m = /^-+[A-Za-z]*/.exec(rest)!;
            push('flag', m[0]);
            i += m[0].length;
            continue;
        }
        WORD.lastIndex = i;
        const w = WORD.exec(line);
        if (w) {
            const word = w[0];
            const lower = word.toLowerCase();
            const next = line[i + word.length];
            let kind: CodeKind = 'ident';
            if (language === 'sql' && SQL_WORDS.has(lower)) kind = 'keyword';
            else if (language === 'dbml' && DBML_WORDS.has(lower))
                kind = 'keyword';
            else if (language === 'dbml' && DBML_TYPES.has(lower))
                kind = 'type';
            else if (next === '(') kind = 'func';
            push(kind, word);
            i += word.length;
            continue;
        }
        push(/[{}()[\],;:<>=|.]/.test(ch) ? 'punct' : 'plain', ch);
        i += 1;
    }
    return { spans, inBlockComment: block };
}

/** Highlights a whole text, line by line, carrying a block comment across lines. */
export function highlight(text: string, language: CodeLanguage): CodeSpan[][] {
    let block = false;
    return text.split('\n').map((line) => {
        const r = highlightLine(line, language, block);
        block = r.inBlockComment;
        return r.spans;
    });
}
