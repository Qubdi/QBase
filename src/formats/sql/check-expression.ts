export interface CheckProblem {
    message: string;
    /** 1-based position inside the expression */
    line: number;
    column: number;
}

const DANGEROUS = new Set([
    'DROP',
    'DELETE',
    'INSERT',
    'UPDATE',
    'ALTER',
    'CREATE',
    'EXEC',
    'EXECUTE',
    'SELECT',
]);

/**
 * Checks a CHECK expression before it is accepted (EXP-049). Accepted: column
 * names, literals, operators, IN, BETWEEN, LIKE, IS NULL, function calls and
 * balanced parentheses. Refused, with a position: empty text, open brackets or
 * quotes, statements, sub-queries, comments and dangerous keywords. The list
 * of functions is not restricted here (open question Q6): any name followed by
 * a bracket is a call.
 */
export function checkExpression(expression: string): CheckProblem | undefined {
    if (expression.trim() === '')
        return { message: 'The expression is empty', line: 1, column: 1 };
    let line = 1;
    let column = 0;
    const open: { line: number; column: number }[] = [];
    let quote: { char: string; line: number; column: number } | undefined;
    let word = '';
    let wordStart = { line: 1, column: 1 };
    const endWord = (): CheckProblem | undefined => {
        const upper = word.toUpperCase();
        const at = wordStart;
        word = '';
        if (DANGEROUS.has(upper))
            return {
                message:
                    upper === 'SELECT'
                        ? 'Sub-queries are not allowed in a check'
                        : `The keyword ${upper} is not allowed in a check`,
                ...at,
            };
        return undefined;
    };
    for (let i = 0; i < expression.length; i++) {
        const ch = expression[i];
        column++;
        if (ch === '\n') {
            line++;
            column = 0;
        }
        if (quote) {
            if (ch === quote.char) {
                if (expression[i + 1] === quote.char) {
                    i++;
                    column++;
                } else quote = undefined;
            }
            continue;
        }
        if (/[A-Za-z_]/.test(ch) || (word && /[A-Za-z0-9_]/.test(ch))) {
            if (!word) wordStart = { line, column };
            word += ch;
            continue;
        }
        const problem = word ? endWord() : undefined;
        if (problem) return problem;
        if (ch === "'" || ch === '"' || ch === '`')
            quote = { char: ch, line, column };
        else if (ch === '(') open.push({ line, column });
        else if (ch === ')') {
            if (open.pop() === undefined)
                return {
                    message: 'Unbalanced parentheses: extra )',
                    line,
                    column,
                };
        } else if (ch === ';')
            return {
                message: 'Statements are not allowed in a check',
                line,
                column,
            };
        else if (
            (ch === '-' && expression[i + 1] === '-') ||
            (ch === '/' && expression[i + 1] === '*')
        )
            return {
                message: 'Comments are not allowed in a check',
                line,
                column,
            };
    }
    if (quote)
        return {
            message: 'Unterminated quoted text',
            line: quote.line,
            column: quote.column,
        };
    const last = word ? endWord() : undefined;
    if (last) return last;
    const unclosed = open[open.length - 1];
    if (unclosed)
        return {
            message: 'Unbalanced parentheses: ( is not closed',
            ...unclosed,
        };
    return undefined;
}
