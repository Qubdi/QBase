import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { diagrams, snapshots } from '../db/schema.js';

/** What a diagram list shows about each diagram, read from its content. */
export interface DiagramStats {
    databaseType: string | null;
    databaseEdition: string | null;
    tableCount: number;
    relationshipCount: number;
    /** when the diagram was first created, as the editor recorded it */
    createdAt: string | null;
}

const text = (v: unknown): string | null =>
    typeof v === 'string' && v !== '' ? v : null;

const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** The same numbers the SQL below computes, for content already in memory. */
export function diagramStats(content: unknown): DiagramStats {
    const c =
        content && typeof content === 'object'
            ? (content as Record<string, unknown>)
            : {};
    return {
        databaseType: text(c.databaseType),
        databaseEdition: text(c.databaseEdition),
        tableCount: count(c.tables),
        relationshipCount: count(c.relationships),
        createdAt: text(c.createdAt),
    };
}

// The list is read for every diagram a user can see, so the numbers are never
// worked out from the content on the way out. Writers' lists read the columns
// the database keeps up to date as the working copy is written; viewers' read
// the latest snapshot, where the numbers are taken inside the database instead
// of loading each full diagram.
export const statsColumns = {
    databaseType: diagrams.statDatabaseType,
    databaseEdition: diagrams.statDatabaseEdition,
    tableCount: diagrams.statTableCount,
    relationshipCount: diagrams.statRelationshipCount,
    createdAt: diagrams.statCreatedAt,
} satisfies { [K in keyof DiagramStats]: PgColumn };

const snapshotColumnsOf = (
    col: PgColumn
): { [K in keyof DiagramStats]: SQL<DiagramStats[K]> } => ({
    databaseType: sql<string | null>`nullif(${col}->>'databaseType', '')`,
    databaseEdition: sql<string | null>`nullif(${col}->>'databaseEdition', '')`,
    tableCount: sql<number>`case when jsonb_typeof(${col}->'tables') = 'array' then jsonb_array_length(${col}->'tables') else 0 end`,
    relationshipCount: sql<number>`case when jsonb_typeof(${col}->'relationships') = 'array' then jsonb_array_length(${col}->'relationships') else 0 end`,
    createdAt: sql<string | null>`nullif(${col}->>'createdAt', '')`,
});
export const snapshotStatsColumns = snapshotColumnsOf(snapshots.content);
