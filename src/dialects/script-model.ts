import type { KeyMethod } from '@/core/model/key';

export type Severity = 'error' | 'warning' | 'info';

/** A message about the text being read or the design being written. */
export interface Diagnostic {
    severity: Severity;
    message: string;
    line?: number;
    column?: number;
    suggestion?: string;
    /** true when the text can be repaired by an automatic fix */
    fixable?: boolean;
}

export interface TableName {
    schema?: string;
    name: string;
}

export interface ScriptColumn {
    name: string;
    /** lower-case type text as the dialect spells it, without arguments */
    typeName: string;
    length?: number | 'max';
    precision?: number;
    scale?: number;
    isArray: boolean;
    nullable: boolean;
    primary: boolean;
    unique: boolean;
    numbered: boolean;
    default?: string;
    comment?: string;
}

export interface ScriptKey {
    name?: string;
    columns: string[];
}

export interface ScriptTable extends TableName {
    columns: ScriptColumn[];
    primaryKey?: ScriptKey;
    uniqueKeys: ScriptKey[];
    checks: string[];
    comment?: string;
    view: boolean;
    materialized: boolean;
    /** 1-based line of the statement that made it */
    line: number;
}

export interface ScriptIndex {
    table: TableName;
    name: string;
    unique: boolean;
    columns: string[];
    method?: KeyMethod;
    line: number;
}

export interface ScriptForeignKey {
    name?: string;
    table: TableName;
    columns: string[];
    refTable: TableName;
    refColumns: string[];
    line: number;
}

export interface ScriptEnum {
    schema?: string;
    name: string;
    values: string[];
}

/** What a reader finds in a script: plain data, no model ids. */
export interface ScriptResult {
    tables: ScriptTable[];
    indexes: ScriptIndex[];
    foreignKeys: ScriptForeignKey[];
    enums: ScriptEnum[];
    diagnostics: Diagnostic[];
}
