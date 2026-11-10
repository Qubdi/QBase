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

/** The stat columns of a row about to be written, from the content it will hold. */
export function statValues(content: unknown, contentBytes: number) {
    const stats = diagramStats(content);
    return {
        statDatabaseType: stats.databaseType,
        statDatabaseEdition: stats.databaseEdition,
        statTableCount: stats.tableCount,
        statRelationshipCount: stats.relationshipCount,
        statCreatedAt: stats.createdAt,
        statContentBytes: contentBytes,
    };
}

// The list is read for every diagram a user can see, so the numbers are never
// worked out from the content on the way out. Writers' lists read the columns
// the app keeps up to date as the working copy is written; viewers' read the
// latest snapshot's columns, which are copied when it is made. A snapshot the
// start-up fill has not reached has no numbers yet (its table count is null):
// for those only, they are taken from the content.
export const statsColumns = {
    databaseType: diagrams.statDatabaseType,
    databaseEdition: diagrams.statDatabaseEdition,
    tableCount: diagrams.statTableCount,
    relationshipCount: diagrams.statRelationshipCount,
    createdAt: diagrams.statCreatedAt,
} satisfies { [K in keyof DiagramStats]: PgColumn };

/** The SQL that works the numbers out of a jsonb diagram, for rows that have none stored. */
export const contentStatSql = (col: PgColumn) => ({
    databaseType: sql<string | null>`nullif(${col}->>'databaseType', '')`,
    databaseEdition: sql<string | null>`nullif(${col}->>'databaseEdition', '')`,
    tableCount: sql<number>`case when jsonb_typeof(${col}->'tables') = 'array' then jsonb_array_length(${col}->'tables') else 0 end`,
    relationshipCount: sql<number>`case when jsonb_typeof(${col}->'relationships') = 'array' then jsonb_array_length(${col}->'relationships') else 0 end`,
    createdAt: sql<string | null>`nullif(${col}->>'createdAt', '')`,
    bytes: sql<number>`octet_length(${col}::text)`,
});

const snapshotColumns = (): { [K in keyof DiagramStats]: SQL<DiagramStats[K]> } => {
    const fallback = contentStatSql(snapshots.content);
    // `case` reads the content only for a row with nothing stored
    const stored = <T>(column: PgColumn, computed: SQL<T>) =>
        sql<T>`case when ${snapshots.statTableCount} is null then ${computed} else ${column} end`;
    return {
        databaseType: stored(snapshots.statDatabaseType, fallback.databaseType),
        databaseEdition: stored(
            snapshots.statDatabaseEdition,
            fallback.databaseEdition
        ),
        tableCount: sql<number>`coalesce(${snapshots.statTableCount}, ${fallback.tableCount})`,
        relationshipCount: sql<number>`coalesce(${snapshots.statRelationshipCount}, ${fallback.relationshipCount})`,
        createdAt: stored(snapshots.statCreatedAt, fallback.createdAt),
    };
};
export const snapshotStatsColumns = snapshotColumns();

/** A diagram's content size in bytes: the stored one, or measured for a row without one. */
export const diagramBytesSql = sql<number>`coalesce(${diagrams.statContentBytes}, octet_length(${diagrams.content}::text))`;
export const snapshotBytesSql = sql<number>`coalesce(${snapshots.statContentBytes}, octet_length(${snapshots.content}::text))`;
