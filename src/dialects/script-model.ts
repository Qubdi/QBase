import type { KeyMethod } from '@/core/model/key';

export type Severity = 'error' | 'warning' | 'info';

/** A message about the text being read or the design being written. */
/** The diagnostics the screens tell apart by code, not by their English text. */
export type DiagnosticCode =
    'nothing-to-import' | 'nothing-to-export' | 'found-tables';

export interface Diagnostic {
    severity: Severity;
    message: string;
    /** a stable id for the few diagnostics the screens act on; never shown */
    code?: DiagnosticCode;
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
    /** name of the CREATE DOMAIN the column was declared with; `typeName` is then the domain's base type */
    domain?: string;
    /** a computed column: its expression (without the outer parentheses) and whether it is stored */
    generated?: { expression: string; stored: boolean };
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
    /** names from `columns` that sort from high to low */
    descending?: string[];
    /** predicate of a partial (filtered) index, without the WHERE keyword */
    where?: string;
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
