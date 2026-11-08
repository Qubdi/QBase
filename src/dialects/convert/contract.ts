/** Families of SQL the converter knows how to read and write. */
export type Flavour = 'postgres' | 'mysql' | 'sqlserver' | 'sqlite' | 'oracle';

/** How a dialect is read as the source of a conversion. */
export interface ConvertSource {
    flavour: Flavour;
    /** the schema that is not written because it is the database default */
    defaultSchema?: string;
}

/** How a dialect is written as the target of a conversion. */
export interface ConvertTarget {
    flavour: Flavour;
    quote(name: string): string;
    /** longest identifier the database accepts */
    identifierLimit: number;
}

/** A column type with the dialect spelling taken out of it. */
export type Neutral =
    | { kind: 'int'; bits: 8 | 16 | 24 | 32 | 64; unsigned?: boolean }
    | { kind: 'decimal'; precision?: number; scale?: number }
    | { kind: 'float'; bits: 32 | 64 }
    | { kind: 'bool' }
    | { kind: 'char'; length?: number; national?: boolean }
    | { kind: 'varchar'; length?: number | 'max'; national?: boolean }
    | { kind: 'text'; size: 'tiny' | 'regular' | 'medium' | 'long' }
    | { kind: 'binary'; length?: number; varying: boolean }
    | { kind: 'blob'; size: 'tiny' | 'regular' | 'medium' | 'long' }
    | { kind: 'date' }
    | { kind: 'time'; zone: boolean }
    | { kind: 'datetime'; zone: boolean }
    | { kind: 'json'; binary: boolean }
    | { kind: 'uuid' }
    | { kind: 'xml' }
    | { kind: 'enum'; values?: string[] }
    | { kind: 'bits'; length: number }
    | { kind: 'geo'; geography: boolean }
    | { kind: 'array'; of: Neutral }
    | { kind: 'other'; note: string };

export interface NeutralRead {
    neutral: Neutral;
    /** the type itself numbers rows (serial) */
    numbered?: { bits: 16 | 32 | 64 };
    /** a note to show with the column */
    note?: string;
    /** only approximated: the column gets a "Was:" comment */
    approximate?: boolean;
}
