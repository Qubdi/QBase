export function isFunction(value: string): boolean {
    // Common SQL functions
    const functionPatterns = [
        /^CURRENT_TIMESTAMP$/i,
        /^NOW\(\)$/i,
        /^GETDATE\(\)$/i,
        /^CURRENT_DATE$/i,
        /^CURRENT_TIME$/i,
        /^UUID\(\)$/i,
        /^NEWID\(\)$/i,
        /^NEXT VALUE FOR/i,
        /^IDENTITY\s*\(\d+,\s*\d+\)$/i,
    ];
    return functionPatterns.some((pattern) => pattern.test(value.trim()));
}

export function isKeyword(value: string): boolean {
    // Common SQL keywords that can be used as default values
    const keywords = [
        'NULL',
        'TRUE',
        'FALSE',
        'CURRENT_TIMESTAMP',
        'CURRENT_DATE',
        'CURRENT_TIME',
        'CURRENT_USER',
        'SESSION_USER',
        'SYSTEM_USER',
    ];
    return keywords.includes(value.trim().toUpperCase());
}

export function strHasQuotes(value: string): boolean {
    return /^['"].*['"]$/.test(value.trim());
}

export function exportFieldComment(comment: string): string {
    if (!comment) {
        return '';
    }

    return comment
        .split('\n')
        .map((commentLine) => `    -- ${commentLine}\n`)
        .join('');
}

export function formatTableComment(comment: string): string {
    if (!comment) {
        return '';
    }

    // Split by newlines and add -- to each line
    return (
        comment
            .split('\n')
            .map((line) => `-- ${line}`)
            .join('\n') + '\n'
    );
}

export function formatMSSQLTableComment(comment: string): string {
    if (!comment) {
        return '';
    }

    // For MSSQL, we use multi-line comment syntax
    // Escape */ to prevent breaking the comment block
    const escaped = comment.replace(/\*\//g, '* /');
    return `/**\n${escaped}\n*/\n`;
}
