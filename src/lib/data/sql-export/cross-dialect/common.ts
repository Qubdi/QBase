export function escapeSQLComment(comment: string): string {
    if (!comment) {
        return '';
    }

    // Escape single quotes by doubling them
    let escaped = comment.replace(/'/g, "''");

    // Replace newlines with spaces to prevent breaking SQL syntax
    // Some databases support multi-line comments with specific syntax,
    // but for maximum compatibility, we'll replace newlines with spaces
    escaped = escaped.replace(/[\r\n]+/g, ' ');

    // Trim any excessive whitespace
    escaped = escaped.replace(/\s+/g, ' ').trim();

    return escaped;
}
