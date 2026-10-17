import { format } from 'timeago.js';

/** "3 hours ago", "just now": for a time that is shown next to its exact value. */
export const ago = (iso: string, now: Date = new Date()): string =>
    format(new Date(iso), 'en_US', { relativeDate: now });

/** The exact time in the viewer's own format, for a tooltip. */
export const exactTime = (iso: string): string =>
    new Date(iso).toLocaleString();
