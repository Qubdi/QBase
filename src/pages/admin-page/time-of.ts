import { uiLocale } from '@/lib/qubdi/locale';

/** The clock time of an ISO timestamp, in the viewer's locale. */
export const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(uiLocale(), {
        hour: '2-digit',
        minute: '2-digit',
    });
