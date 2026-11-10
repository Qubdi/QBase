import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { isSealed, type CryptoBox } from '../introspect/crypto-box.js';
import {
    ForbiddenTargetError,
    matchesIpEntry,
    resolveAllowedTarget,
    type LookupAll,
} from '../introspect/net-guard.js';

export interface WebhookResult {
    ok: boolean;
    status?: number;
    error?: string;
}

/** What a report says when the host is not allowed or does not resolve. */
export const WEBHOOK_HOST_REFUSED = 'host not allowed';
/** What a report says when the connection could not be made or broke. */
export const WEBHOOK_CONNECTION_FAILED = 'connection failed';

/** How long the connection may sit silent. A server that keeps trickling bytes resets it. */
export const WEBHOOK_TIMEOUT_MS = 5000;
/** How long a whole request may take, trickling or not. */
export const WEBHOOK_DEADLINE_MS = 15_000;

/** The stored form of a webhook URL: its path and query may hold a token, so it is encrypted. */
export const sealWebhookUrl = (box: CryptoBox, url: string) => box.encrypt(url);

/** Reads a stored webhook URL; rows saved before encryption hold the plain URL. */
export const openWebhookUrl = (
    box: CryptoBox | null,
    stored: string
): string | null => {
    if (!isSealed(stored)) return stored;
    if (!box) return null;
    try {
        return box.decrypt(stored);
    } catch {
        return null;
    }
};

/** Where a stored webhook points, without the path or query that may carry a token. */
export const webhookHost = (box: CryptoBox | null, stored: string | null) => {
    if (!stored) return null;
    const url = openWebhookUrl(box, stored);
    if (!url) return null;
    try {
        return new URL(url).host;
    } catch {
        return null;
    }
};

/** True when the allow-list names this host: the exact name, or an address an entry covers. */
const hostAllowListed = (hostname: string, allow: string[]) => {
    const host = hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
    return allow.some(
        (entry) =>
            (!entry.includes('/') && entry.toLowerCase() === host) ||
            (net.isIP(host) !== 0 && matchesIpEntry(host, entry))
    );
};

/**
 * https, or http only to a host the webhook allow-list names (a service on the
 * private network that has no certificate); no credentials in the URL. The URL
 * can carry a token and the body drift details, so they do not cross a network
 * unencrypted by default. Returns the parsed URL or an error.
 */
export function parseWebhookUrl(
    raw: string,
    allow: string[] = []
): { url: URL } | { error: string } {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { error: 'not a valid URL' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { error: 'must be an https URL' };
    }
    if (url.protocol === 'http:' && !hostAllowListed(url.hostname, allow)) {
        return {
            error: 'must be an https URL (plain http is only for hosts in WEBHOOK_ALLOW_HOSTS)',
        };
    }
    if (url.username || url.password) {
        return { error: 'must not contain credentials' };
    }
    return { url };
}

/**
 * POSTs JSON to a webhook. The destination goes through the same private-address
 * guard as database connections, and the request connects to the address that
 * was checked (not to a fresh DNS answer). Redirects are never followed.
 */
export async function postJson(
    rawUrl: string,
    payload: unknown,
    opts: {
        allow: string[];
        lookup?: LookupAll;
        deadlineMs?: number;
        /** Gets the real reason of a failure; the result carries only a fixed text. */
        onFailure?: (reason: string) => void;
    }
): Promise<WebhookResult> {
    const parsed = parseWebhookUrl(rawUrl, opts.allow);
    if ('error' in parsed) return { ok: false, error: parsed.error };
    const { url } = parsed;

    let target;
    try {
        target = await resolveAllowedTarget(url.hostname, opts.allow, opts.lookup);
    } catch (e) {
        // the reason (an address class, "did not resolve") names what is on the
        // internal network: it goes to the log, the report gets a fixed text
        opts.onFailure?.(e instanceof ForbiddenTargetError ? e.message : 'host did not resolve');
        return { ok: false, error: WEBHOOK_HOST_REFUSED };
    }

    const body = JSON.stringify(payload);
    const client = url.protocol === 'https:' ? https : http;
    return new Promise<WebhookResult>((resolve) => {
        const req = client.request(
            url,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(body),
                    'user-agent': 'QBase-drift/1',
                },
                timeout: WEBHOOK_TIMEOUT_MS,
                // connect to the vetted address; TLS still verifies the hostname
                lookup: (_host, _options, cb) => {
                    // node may ask for all addresses or one, depending on version
                    const options = _options as { all?: boolean };
                    if (options?.all) {
                        (cb as unknown as (e: null, a: unknown[]) => void)(null, [
                            { address: target.address, family: target.family },
                        ]);
                    } else {
                        cb(null, target.address, target.family);
                    }
                },
            },
            (res) => {
                res.resume();
                const status = res.statusCode ?? 0;
                resolve({ ok: status >= 200 && status < 300, status });
            }
        );
        req.on('timeout', () => {
            req.destroy(new Error('timed out'));
        });
        // the idle timeout above never fires for a server that sends a byte now
        // and then: an overall deadline ends it, so a check cannot be held open
        const deadline = setTimeout(() => {
            req.destroy(new Error('timed out'));
        }, opts.deadlineMs ?? WEBHOOK_DEADLINE_MS);
        deadline.unref();
        req.on('close', () => clearTimeout(deadline));
        req.on('error', (err) => {
            // a refused, reset or unreachable connection tells refused from filtered
            // from down: only the log gets it
            opts.onFailure?.(err.message.slice(0, 200));
            resolve({
                ok: false,
                error: err.message === 'timed out' ? 'timed out' : WEBHOOK_CONNECTION_FAILED,
            });
        });
        req.end(body);
    });
}
