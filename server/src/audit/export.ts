import type { Db } from '../db/client.js';
import {
    activityQuery,
    decodeCursor,
    listActivity,
    type ActivityItem,
    type ActivityQuery,
} from './activity.js';
import type { AuditMeta } from './audit.js';

/** The most rows one export holds; a log that long is exported in date ranges. */
export const EXPORT_MAX_ROWS = 50_000;
const EXPORT_PAGE = 500;

/** The same filters as the Activity list; an export has no page or cursor. */
export const exportQuery = activityQuery.omit({ limit: true, cursor: true });

/** The filters an export was cut with, for its audit row: only those that were set. */
export const exportFilters = (
    q: Omit<ActivityQuery, 'limit' | 'cursor'>
): NonNullable<AuditMeta['filters']> => ({
    ...(q.group ? { group: q.group } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.diagramId ? { diagramId: q.diagramId } : {}),
    ...(q.from ? { from: q.from.toISOString() } : {}),
    ...(q.to ? { to: q.to.toISOString() } : {}),
    ...(q.saves === 'hide' ? { saves: 'hide' as const } : {}),
});

export const CSV_COLUMNS = [
    'time_utc',
    'who',
    'action',
    'diagram',
    'project',
    'target_user',
    'details',
] as const;

/**
 * One CSV cell. Quoted when it holds a comma, a quote or a line break. A cell
 * that starts with = + - @ (or a tab or carriage return) would be run as a
 * formula by a spreadsheet, and a diagram's title or a project's name is
 * typed by people, so those get a leading apostrophe.
 */
export const csvCell = (value: string | null | undefined): string => {
    if (value === null || value === undefined || value === '') return '';
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const csvRow = (cells: (string | null | undefined)[]) =>
    cells.map(csvCell).join(',') + '\r\n';

const rowOf = (item: ActivityItem) =>
    csvRow([
        item.at.toISOString(),
        item.userEmail,
        item.action,
        item.diagramTitle,
        item.projectName,
        item.targetUserEmail,
        // ids, names, roles: never an email, a token or a password (see AuditMeta)
        item.meta ? JSON.stringify(item.meta) : null,
    ]);

export interface ActivityCsv {
    /** a byte-order mark first, so Excel reads the UTF-8 (Georgian, Cyrillic...) correctly */
    csv: string;
    rows: number;
    /** more rows matched than EXPORT_MAX_ROWS: the newest ones are here */
    truncated: boolean;
}

/**
 * The audit log as CSV, newest first, for the same filters as the Activity
 * list. It walks the log with the list's own keyset cursor, a few hundred rows
 * at a time, so it costs the same however deep it goes, and stops at
 * EXPORT_MAX_ROWS.
 */
export async function exportActivityCsv(
    db: Db,
    q: Omit<ActivityQuery, 'limit' | 'cursor'>,
    maxRows = EXPORT_MAX_ROWS
): Promise<ActivityCsv> {
    const parts: string[] = ['﻿' + csvRow([...CSV_COLUMNS])];
    let rows = 0;
    let cursor: ActivityQuery['cursor'];
    let truncated = false;
    for (;;) {
        const room = maxRows - rows;
        const page = await listActivity(db, {
            ...q,
            limit: Math.min(EXPORT_PAGE, room),
            cursor,
        });
        for (const item of page.items) parts.push(rowOf(item));
        rows += page.items.length;
        if (!page.nextCursor) break;
        if (rows >= maxRows) {
            truncated = true;
            break;
        }
        cursor = decodeCursor(page.nextCursor) ?? undefined;
        if (!cursor) break;
    }
    return { csv: parts.join(''), rows, truncated };
}
