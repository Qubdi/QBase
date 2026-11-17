const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Milliseconds until the written age of a time can next change: a second at a
 * time while it reads in seconds, at the turn of each minute while it reads in
 * minutes, hourly in hours, and daily after that (days, weeks, months, years).
 * `elapsed` is how long ago the time was, in milliseconds; a time in the future
 * is treated as just now.
 */
export function msUntilAgeChanges(elapsed: number): number {
    const e = Math.max(0, elapsed);
    const unit = e < MINUTE ? SECOND : e < HOUR ? MINUTE : e < DAY ? HOUR : DAY;
    // the rest of the current unit, so the text is rewritten when it turns
    return unit - (e % unit) + 20;
}
