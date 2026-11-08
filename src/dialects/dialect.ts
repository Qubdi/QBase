import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import type { KeyMethod } from '@/core/model/key';
import type { ConvertSource, ConvertTarget } from './convert/contract';
import type { ScriptResult } from './script-model';

/** How a database numbers rows automatically. */
export type NumberingStyle =
    | 'serial'
    | 'identity-property'
    | 'auto-increment-keyword'
    | 'integer-key-only'
    | 'none';

export interface DialectCapabilities {
    /** tables are grouped by schema */
    schemas: boolean;
    enumTypes: boolean;
    compositeTypes: boolean;
    arrayColumns: boolean;
    checkConstraints: boolean;
    views: boolean;
    materializedViews: boolean;
    /** comments are stored in the database (COMMENT ON ...) */
    nativeComments: boolean;
    indexMethods: readonly KeyMethod[];
    numbering: NumberingStyle;
}

/** Turns SQL text into the neutral script model (no ids, no layout). */
export type SqlReader = (text: string) => ScriptResult;

/** Writes a design in the dialect's own SQL. The design is already filtered. */
export type SqlWriter = (design: Design) => string;

export interface DialectSql {
    read?: SqlReader;
    write?: SqlWriter;
    /** repairs errors the reader marks as fixable */
    fix?: (text: string) => string;
    /** how this dialect appears as the source of a conversion */
    source?: ConvertSource;
    /** how this dialect appears as the target of a conversion */
    target?: ConvertTarget;
}

export interface Dialect {
    id: DatabaseType;
    label: string;
    capabilities: DialectCapabilities;
    /** type names offered in the editor, in picker order */
    types: readonly string[];
    defaultType: string;
    defaultSchema?: string;
    /** type names folded to one spelling when metadata or SQL is read */
    typeSynonyms?: Readonly<Record<string, string>>;
    /** id of the dialect whose code this one reuses (MariaDB) */
    variantOf?: DatabaseType;
    sql: DialectSql;
}
