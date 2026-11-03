import { z } from 'zod';

/**
 * Postgres timestamps run from 4713 BC to 294276 AD. A JavaScript Date reaches
 * further back (to year -271821), and a value past the edge makes the query
 * fail with a 500. The far end is beyond what a Date can hold, so only the
 * early edge needs a check; the margin keeps a day inside the real limit.
 */
const PG_MIN_TIME = new Date('-004712-01-01T00:00:00Z').getTime();

/** A date taken from a request, bounded to what Postgres can store. */
export const pgDate = () =>
    z.coerce.date().refine((d) => d.getTime() >= PG_MIN_TIME, {
        message: 'date is outside the supported range',
    });
