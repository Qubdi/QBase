import type { DatabaseType } from '@/core/model/database';

type Rule = { dialect: DatabaseType; test: (text: string) => boolean };

const any = (text: string, patterns: RegExp[]): boolean =>
    patterns.some((p) => p.test(text));
const count = (text: string, patterns: RegExp[]): number =>
    patterns.filter((p) => p.test(text)).length;

/** Ordered checks: the first that matches decides (IMP-008). */
const RULES: Rule[] = [
    {
        dialect: 'postgresql',
        test: (t) =>
            any(t, [
                /\bSET\s+(?:statement_timeout|lock_timeout|client_encoding|standard_conforming_strings)\b/i,
                /SELECT\s+pg_catalog\.set_config/i,
                /\bALTER\s+TABLE\s+ONLY\b/i,
                /\bCOMMENT\s+ON\s+EXTENSION\b/i,
                /\bCOPY\s+[^;]*\bFROM\s+stdin\b/i,
                /^--\s*Name:\s*[^;\n]+;\s*Type:/im,
            ]),
    },
    {
        dialect: 'sql_server',
        test: (t) =>
            any(t, [
                /\bSET\s+(?:ANSI_NULLS|QUOTED_IDENTIFIER|ANSI_PADDING)\s+ON\b/i,
                /\bEXEC\s+sys\.sp_/i,
                /\[dbo\]\./i,
                /\bIDENTITY\s*\(\s*\d+/i,
                /\bNVARCHAR\b/i,
                /\bUNIQUEIDENTIFIER\b/i,
                /\bALTER\s+TABLE\s+\[/i,
                /\bdatetime2\b/i,
                /\[[^\]\s]+\]\s*\.\s*\[[^\]\s]+\]/,
            ]),
    },
    {
        dialect: 'mysql',
        test: (t) =>
            any(t, [
                /^--\s*(?:MySQL|MariaDB) dump/im,
                /^--\s*Host:/im,
                /^--\s*Server version:/im,
            ]) ||
            (t.includes('`') &&
                count(t, [
                    /\bSTART\s+TRANSACTION\b/i,
                    /\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i,
                    /\bENGINE\s*=/i,
                    /\bDEFAULT\s+CHARSET\s*=/i,
                    /\bCOLLATE\s*=/i,
                    /\bAUTO_INCREMENT\s*=\s*\d+/i,
                    /\bALTER\s+TABLE\b[^;]*\bADD\s+CONSTRAINT\b[^;]*\bFOREIGN\s+KEY\b/i,
                ]) >= 2),
    },
    {
        dialect: 'sqlite',
        test: (t) =>
            any(t, [
                /\bPRAGMA\b/i,
                /\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/i,
                /DEFAULT\s*\(\s*datetime\(/i,
                /\bsqlite_sequence\b/i,
                /\bCREATE\s+TRIGGER\b[\s\S]*\bBEGIN\b/i,
            ]),
    },
    {
        dialect: 'oracle',
        test: (t) =>
            any(t, [
                /\bN?VARCHAR2\b/i,
                /\bNUMBER\s*\(\s*\d/i,
                /\bSYSDATE\b/i,
                /\bSYS_GUID\s*\(/i,
                /\bBINARY_(?:FLOAT|DOUBLE)\b/i,
                /\b(?:PCTFREE|NOCOMPRESS|NOLOGGING)\b/i,
                /\bTABLESPACE\s+\w+\s*;/i,
            ]),
    },
    {
        dialect: 'postgresql',
        test: (t) =>
            any(t, [
                /\bSERIAL\s+PRIMARY\s+KEY\b/i,
                /\bCREATE\s+EXTENSION\b/i,
                /\bWITH\s*\(\s*OIDS/i,
                /\bRETURNS\s+SETOF\b/i,
            ]),
    },
    {
        dialect: 'mysql',
        test: (t) =>
            any(t, [
                /\bAUTO_INCREMENT\b/i,
                /\bENGINE\s*=\s*InnoDB\b/i,
                /\bDEFINER\s*=/i,
            ]),
    },
    {
        // a procedure alone is a weak signal: every stronger rule goes first
        dialect: 'sql_server',
        test: (t) => /\bCREATE\s+PROCEDURE\b/i.test(t),
    },
];

/** Picks the dialect a script was written for; PostgreSQL when nothing matches. */
export function detectDialect(text: string): DatabaseType {
    return RULES.find((r) => r.test(text))?.dialect ?? 'postgresql';
}
