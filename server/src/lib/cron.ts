// A small, dependency-free parser for classic 5-field cron expressions:
//   minute hour day-of-month month day-of-week
// Supports "*", lists (1,15), ranges (1-5), steps (*/10, 0-30/5). All times are UTC.

interface Field {
    values: Set<number>;
    /** true when the field was "*" (matters for the day-of-month/week rule) */
    any: boolean;
}

const RANGES = [
    { name: 'minute', min: 0, max: 59 },
    { name: 'hour', min: 0, max: 23 },
    { name: 'day of month', min: 1, max: 31 },
    { name: 'month', min: 1, max: 12 },
    { name: 'day of week', min: 0, max: 7 },
] as const;

export interface CronSchedule {
    minute: Field;
    hour: Field;
    dom: Field;
    month: Field;
    dow: Field;
}

const int = (s: string, label: string): number => {
    if (!/^\d+$/.test(s)) throw new Error(`invalid ${label}: "${s}"`);
    return Number(s);
};

function parseField(text: string, idx: number): Field {
    const { name, min, max } = RANGES[idx];
    const values = new Set<number>();
    let any = false;
    for (const part of text.split(',')) {
        if (part === '') throw new Error(`empty ${name} entry`);
        const [rangePart, stepPart, extra] = part.split('/');
        if (extra !== undefined) throw new Error(`invalid ${name}: "${part}"`);
        const step = stepPart === undefined ? 1 : int(stepPart, `${name} step`);
        if (step < 1) throw new Error(`${name} step must be at least 1`);
        let lo: number;
        let hi: number;
        if (rangePart === '*') {
            lo = min;
            hi = idx === 4 ? 6 : max;
            if (stepPart === undefined && text === '*') any = true;
        } else if (rangePart.includes('-')) {
            const [a, b, c] = rangePart.split('-');
            if (c !== undefined) throw new Error(`invalid ${name}: "${part}"`);
            lo = int(a, name);
            hi = int(b, name);
            if (lo > hi) throw new Error(`${name} range ${lo}-${hi} is backwards`);
        } else {
            lo = int(rangePart, name);
            hi = stepPart === undefined ? lo : max;
        }
        if (lo < min || hi > max) {
            throw new Error(`${name} must be between ${min} and ${max}`);
        }
        for (let v = lo; v <= hi; v += step) values.add(idx === 4 && v === 7 ? 0 : v);
    }
    return { values, any };
}

export function parseCron(expr: string): CronSchedule {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) {
        throw new Error('a schedule needs 5 fields: minute hour day month weekday');
    }
    const [minute, hour, dom, month, dow] = parts.map((p, i) => parseField(p, i));
    return { minute, hour, dom, month, dow };
}

export function isValidCron(expr: string): boolean {
    try {
        parseCron(expr);
        return true;
    } catch {
        return false;
    }
}

function dayMatches(s: CronSchedule, d: Date): boolean {
    const domOk = s.dom.values.has(d.getUTCDate());
    const dowOk = s.dow.values.has(d.getUTCDay());
    // classic cron: when both are restricted, either may match
    if (!s.dom.any && !s.dow.any) return domOk || dowOk;
    return domOk && dowOk;
}

/** The first matching minute strictly after `after`, or null if none in ~8 years. */
export function nextCronRun(expr: string, after: Date): Date | null {
    const s = parseCron(expr);
    const start = new Date(after.getTime());
    start.setUTCSeconds(0, 0);
    start.setUTCMinutes(start.getUTCMinutes() + 1);

    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    for (let i = 0; i < 366 * 8; i++, day.setUTCDate(day.getUTCDate() + 1)) {
        if (!s.month.values.has(day.getUTCMonth() + 1) || !dayMatches(s, day)) continue;
        const sameDay = day.getTime() === Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
        for (const h of [...s.hour.values].sort((a, b) => a - b)) {
            if (sameDay && h < start.getUTCHours()) continue;
            for (const m of [...s.minute.values].sort((a, b) => a - b)) {
                if (sameDay && h === start.getUTCHours() && m < start.getUTCMinutes()) continue;
                return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m));
            }
        }
    }
    return null;
}
