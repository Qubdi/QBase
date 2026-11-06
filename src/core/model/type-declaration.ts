import type { ColumnLength } from './column';

export interface TypeDeclaration {
    name: string;
    length?: ColumnLength;
    precision?: number;
    scale?: number;
    isArray?: boolean;
}

/**
 * Reads a typed declaration such as `varchar(255)`, `numeric(10,2)`,
 * `decimal(8)`, `varchar(max)` or `integer[]` (editor 4.5). `lengthTypes`
 * names the types whose single number is a length (the rest take it as a
 * precision). Returns undefined when the text is not a declaration.
 */
export function parseTypeDeclaration(
    text: string,
    lengthTypes: readonly string[] = [
        'char',
        'varchar',
        'nchar',
        'nvarchar',
        'varbinary',
        'binary',
        'character',
        'character varying',
    ]
): TypeDeclaration | undefined {
    const match =
        /^\s*([A-Za-z_][A-Za-z0-9_ ]*?)\s*(?:\(\s*([^)]*?)\s*\))?\s*(\[\])?\s*$/.exec(
            text
        );
    if (!match) return undefined;
    const [, rawName, args, brackets] = match;
    const name = rawName.trim().replace(/\s+/g, ' ');
    const out: TypeDeclaration = { name };
    if (brackets) out.isArray = true;
    if (args === undefined) return out;
    const parts = args.split(',').map((p) => p.trim());
    if (parts.length === 1) {
        const [one] = parts;
        if (one.toLowerCase() === 'max') {
            out.length = 'max';
            return out;
        }
        if (!/^\d+$/.test(one)) return undefined;
        if (lengthTypes.includes(name.toLowerCase())) out.length = Number(one);
        else out.precision = Number(one);
        return out;
    }
    if (parts.length === 2 && parts.every((p) => /^\d+$/.test(p))) {
        out.precision = Number(parts[0]);
        out.scale = Number(parts[1]);
        return out;
    }
    return undefined;
}
