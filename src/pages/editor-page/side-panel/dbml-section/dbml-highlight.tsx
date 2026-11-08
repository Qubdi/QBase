import React from 'react';

const KEYWORD = /^(\s*)(Table|TableGroup|Enum|Ref|Project|Indexes|Note)\b/;
const COLUMN =
    /^(\s*)("(?:[^"]|"")*")(\s+)([A-Za-z_][\w.]*(?:\([^)]*\))?(?:\[\])?)/;
const PART = /("[^"]*"|'[^']*')|(\[[^\]]*\])|([{}])|(\/\/.*$)/g;

const CLASS = {
    keyword: 'text-blue-700 dark:text-blue-300',
    string: 'text-red-800 dark:text-red-300',
    type: 'text-teal-700 dark:text-teal-300',
    setting: 'text-slate-500 dark:text-slate-400',
    bracket: 'text-emerald-700 dark:text-emerald-400',
    comment: 'text-slate-500 dark:text-slate-400',
};

const span = (cls: string, text: string, key: number) => (
    <span key={key} className={cls}>
        {text}
    </span>
);

/** Colours the quoted strings, [settings] and braces of a stretch of DBML. */
function scan(text: string, first: number): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let at = 0;
    let key = first;
    for (const m of text.matchAll(PART)) {
        const i = m.index ?? 0;
        if (i > at) out.push(text.slice(at, i));
        if (m[1]) out.push(span(CLASS.string, m[1], key++));
        else if (m[2])
            out.push(
                span(CLASS.bracket, '[', key++),
                span(CLASS.setting, m[2].slice(1, -1), key++),
                span(CLASS.bracket, ']', key++)
            );
        else if (m[3]) out.push(span(CLASS.keyword, m[3], key++));
        else out.push(span(CLASS.comment, m[4], key++));
        at = i + m[0].length;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
}

/**
 * One line of DBML with the editor's colours: keywords blue, strings dark
 * red, types teal, settings grey. A cheap tokenizer for display only; what it
 * does not know stays plain text.
 */
export function highlightLine(line: string): React.ReactNode {
    const word = KEYWORD.exec(line);
    if (word) {
        const [whole, space, name] = word;
        return [
            space,
            span(CLASS.keyword, name, 0),
            ...scan(line.slice(whole.length), 1),
        ];
    }
    const column = COLUMN.exec(line);
    if (column) {
        const [whole, space, quoted, gap, type] = column;
        return [
            space,
            span(CLASS.string, quoted, 0),
            gap,
            span(CLASS.type, type, 1),
            ...scan(line.slice(whole.length), 2),
        ];
    }
    return scan(line, 0);
}
