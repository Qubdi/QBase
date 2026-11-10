import { i18n } from '@/i18n/i18n';
import { uiLocale } from '@/lib/qubdi/locale';

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
