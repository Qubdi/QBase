import type { Design } from '@/core/model/design';
import type { Diagnostic } from '@/dialects/script-model';
import { error } from './diagnostics';
import { checkExpression } from './check-expression';

/** Characters a column's type name may hold: words, spaces, dots, quotes, brackets, lengths. */
const TYPE_TEXT = /^[A-Za-z0-9_$ ."(),[\]]+$/;

/**
 * True when text would end the statement it is written into: a `;`, a comment
 * start, or brackets that do not pair up, outside single-quoted strings.
 */
export function breaksStatement(text: string): boolean {
    let depth = 0;
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "'") {
            quoted = !quoted;
            continue;
        }
        if (quoted) continue;
        if (ch === ';') return true;
        if (ch === '-' && text[i + 1] === '-') return true;
        if (ch === '/' && text[i + 1] === '*') return true;
        if (ch === '(') depth++;
        if (ch === ')' && --depth < 0) return true;
    }
    return quoted || depth !== 0;
}

/**
 * The text of a design that the writers put into DDL as it is: CHECK,
 * generated-column and index WHERE expressions, column type names and
 * function-call defaults. Anything that could end the statement it sits in is
 * reported, and nothing is exported (the writers do not escape these).
 */
export function unsafeText(design: Design): Diagnostic[] {
    const out: Diagnostic[] = [];
    // one pass: which table each column belongs to, for the messages
    const owner = new Map<string, string>();
    for (const id of design.entities.order) {
        const entity = design.entities.byId[id];
        for (const columnId of entity.columnIds)
            owner.set(columnId, entity.name);
    }
    const where = (id: string) => (owner.has(id) ? `${owner.get(id)}.` : '');
    const expression = (what: string, text: string) => {
        const problem = checkExpression(text);
        if (problem) out.push(error(`${what}: ${problem.message}`));
    };
    for (const rule of Object.values(design.rules))
        expression('A check', rule.expression);
    for (const column of Object.values(design.columns)) {
        const label = `Column ${where(column.id)}${column.name}`;
        if (
            !TYPE_TEXT.test(column.type.name) ||
            breaksStatement(column.type.name)
        )
            out.push(
                error(
                    `${label}: the type "${column.type.name}" cannot be written`
                )
            );
        if (column.generated)
            expression(`${label} (generated)`, column.generated.expression);
        const text = column.default?.trim();
        if (text && breaksStatement(text))
            out.push(
                error(`${label}: the default value could end the statement`)
            );
    }
    for (const key of Object.values(design.keys))
        if (key.where)
            expression(`Index ${key.label || '(unnamed)'} (WHERE)`, key.where);
    return out;
}
