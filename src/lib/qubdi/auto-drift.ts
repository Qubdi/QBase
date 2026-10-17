import { api, type DriftBadge } from './api';

/**
 * Opening a diagram that remembers a database to compare with checks it against
 * that database. The server reads the database and stores a drift report, or,
 * when a recent report of the unchanged diagram exists, hands that back.
 *
 * Resolves to the badge to show afterwards, or undefined when no check ran: the
 * diagram has no saved connection, the person cannot see drift (a viewer), a
 * check is already running, or the database could not be reached for reasons
 * the server did not turn into a report. The drift dialog reports real errors.
 */
export async function checkDriftOnOpen(
    remoteId: string
): Promise<DriftBadge | null | undefined> {
    try {
        const overview = await api.getDrift(remoteId);
        if (!overview.settings?.connectionId) return undefined;
        return (await api.checkDrift(remoteId, { cached: true })).badge;
    } catch {
        return undefined;
    }
}
