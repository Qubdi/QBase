/**
 * datetime-local value <-> ISO string. The field shows and reads the viewer's
 * local time, so the value is built from local date parts: the ISO text is UTC.
 */
const pad = (n: number) => String(n).padStart(2, '0');
export const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => {
    if (!v) return null;
    const d = new Date(v); // no zone in the text: read as local time
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
