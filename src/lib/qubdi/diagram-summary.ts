import { i18n } from '@/i18n/i18n';
import { DatabaseEdition, DatabaseType } from '@/qbase/diagram-types';
import { uiLocale } from '@/lib/qubdi/locale';

/** The database a server diagram is for; anything unknown is PostgreSQL. */
export const toDatabaseType = (
    value: string | null | undefined
): DatabaseType =>
    (Object.values(DatabaseType) as string[]).includes(value ?? '')
        ? (value as DatabaseType)
        : DatabaseType.POSTGRESQL;

export const toDatabaseEdition = (
    value: string | null | undefined
): DatabaseEdition | undefined =>
    (Object.values(DatabaseEdition) as string[]).includes(value ?? '')
        ? (value as DatabaseEdition)
        : undefined;

/** A date for a list cell; a dash when the server does not know it. */
export function formatWhen(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(uiLocale());
}

/** "3 tables" style label for screen readers and tooltips. */
export const countLabel = (
    n: number | null | undefined,
    noun: 'table' | 'relationship'
) => i18n.t(`qubdi.workspace.diagramSummary.${noun}`, { count: n ?? 0 });
