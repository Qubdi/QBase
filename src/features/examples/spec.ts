import type { DatabaseType } from '@/core/model/database';

/**
 * One example written compactly: its areas, its notes and its tables. The
 * tables are written once and `write-script.ts` turns them into the SQL (or
 * DBML) of the example's own database, so a large example stays readable.
 */
export interface Domain {
    /** the example this fills in; a key of `EXAMPLES` */
    id: string;
    databaseType: DatabaseType;
    /** the name of the diagram that opens */
    name: string;
    areas: readonly AreaSpec[];
    /** sticky notes, each above the area it explains */
    notes: readonly NoteSpec[];
    /** every table, in the order its area lays them out */
    tables: readonly TableSpec[];
}

export interface AreaSpec {
    id: string;
    label: string;
    /** 0 to 12: the colour of the area and of its tables (a place in the area palette) */
    tone: number;
}

export interface NoteSpec {
    /** the area the note sits above */
    area: string;
    /** up to 160 characters */
    text: string;
}

export interface TableSpec {
    name: string;
    /** the area the table sits in */
    area: string;
    /** what the table holds, in one sentence: shown as the table's description */
    about: string;
    /** the columns, see `ColumnSource` */
    columns: readonly ColumnSource[];
}

/**
 * One column as a line of text: `name type flags | what it holds`.
 *
 * Types: `id` (the surrogate key, named as given), `int`, `big`, `small`,
 * `text`, `str40` (any length), `date`, `time`, `ts`, `bool`, `dec10,2`,
 * `uuid`, `json`, `bin`. A column that points to another table has no type:
 * `clinic_id >clinics !` takes the type of `clinics.id`; `>clinics.code`
 * points to another column.
 *
 * Flags: `!` not null, `u` unique, `pk` one of a composite key.
 *
 * Examples: `id id`, `email str160 ! u | the login address`,
 * `doctor_id >doctors ! | who sees the patient`, `birth_date date`.
 */
export type ColumnSource = string;

export interface ParsedColumn {
    name: string;
    /** a type word, or 'fk' */
    type: string;
    notNull: boolean;
    unique: boolean;
    pk: boolean;
    /** the table (and column) a foreign key points to */
    references?: { table: string; column: string };
    about?: string;
}

const TYPE =
    /^(id|int|big|small|text|str\d+|date|time|ts|bool|dec\d+,\d+|uuid|json|bin)$/;

export function parseColumn(source: ColumnSource): ParsedColumn {
    const [head, ...rest] = source.split('|');
    const about = rest.join('|').trim() || undefined;
    const words = head.trim().split(/\s+/);
    const name = words.shift();
    if (!name) throw new Error(`column without a name: "${source}"`);
    let type: string | undefined;
    const column: ParsedColumn = {
        name,
        type: '',
        notNull: false,
        unique: false,
        pk: false,
        about,
    };
    for (const word of words) {
        if (TYPE.test(word)) type = word;
        else if (word === '!') column.notNull = true;
        else if (word === 'u') column.unique = true;
        else if (word === 'pk') column.pk = true;
        else if (word.startsWith('>')) {
            const [table, col] = word.slice(1).split('.');
            column.references = { table, column: col ?? 'id' };
        } else throw new Error(`unknown word "${word}" in column "${source}"`);
    }
    column.type = type ?? (column.references ? 'fk' : '');
    if (!column.type) throw new Error(`column without a type: "${source}"`);
    if (column.type === 'id') {
        column.pk = true;
        column.notNull = true;
    }
    return column;
}
