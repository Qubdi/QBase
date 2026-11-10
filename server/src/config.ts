import { normalizeMinLength } from '../../shared/password.js';
import { allowEntryProblem } from './introspect/net-guard.js';

export interface Config {
    databaseUrl: string;
    /** interface the HTTP server listens on */
    host: string;
    port: number;
    corsOrigin: string | null;
    /**
     * Folder holding the built editor (WEB_DIR). When set, the server serves the
     * editor itself and the API moves under /api; null = API only, at the root.
     */
    webDir: string | null;
    sessionDays: number;
    /** a session unused for this many days ends, well before `sessionDays`; 0 turns it off */
    sessionIdleDays: number;
    /**
     * Which proxies to trust for the client address (Fastify `trustProxy`):
     * true, a hop count, or a list of addresses. False = use the socket's.
     */
    trustProxy: boolean | number | string[];
    /** lint calls a minute per user (linting runs synchronously) */
    lintRateLimit: number;
    /** connections to customers' databases a minute per user (introspection, drift checks) */
    outboundRateLimit: number;
    /** newest snapshots kept per diagram; older ones are deleted. 0 keeps all */
    snapshotKeep: number;
    /** newest drift reports kept per diagram; older ones are deleted. 0 keeps all */
    driftReportKeep: number;
    /** largest request body on ordinary routes, in bytes */
    bodyLimit: number;
    /** largest request body on the routes that carry a whole diagram, in bytes */
    diagramBodyLimit: number;
    /** audit rows older than this many days are deleted; 0 keeps them all */
    auditRetentionDays: number;
    /** share links revoked or expired this many days ago are deleted; 0 keeps them all */
    deadLinkKeepDays: number;
    /**
     * The session cookie's `Secure` flag: always, never, or only on requests
     * that arrived over HTTPS ('auto'; behind a proxy this needs `trustProxy`
     * so the forwarded protocol is believed).
     */
    cookieSecure: boolean | 'auto';
    /** sign-in, sign-up and change-password calls a minute per client address */
    authRateLimit: number;
    /** failed sign-ins (or password checks) one account may have in the lockout window */
    authMaxFailures: number;
    /** how long a locked-out account waits, in minutes */
    authLockoutMinutes: number;
    /** fewest characters a new password may have (never below 8); sign-in does not check it */
    passwordMinLength: number;
    /** most live (SSE) viewers one share link may have open at once */
    sseMaxPerLink: number;
    /** most live (SSE) viewers one client address may have open at once, over all links */
    sseMaxPerIp: number;
    /** seconds between the pings that keep a live stream open (and re-check who is on it) */
    sseHeartbeatSeconds: number;
    /** pino level: fatal, error, warn, info, debug, trace or silent */
    logLevel: string;
    /** most database connections the pool opens at once */
    dbPoolMax: number;
    /** a save's audit row is written at most this often per person and diagram, in minutes; 0 logs every save */
    auditSaveMinutes: number;
    /** auto-publish rewrites the person's latest auto snapshot when it is younger than this many seconds; 0 always adds one */
    autoPublishCoalesceSeconds: number;
    /** longest a database statement may run, in seconds; 0 means no limit */
    dbStatementTimeoutSeconds: number;
    /** max requests per minute per IP on the public share routes */
    shareRateLimit: number;
    /** hostnames, IPs or IPv4 CIDRs that introspection may reach even if private */
    introspectAllowHosts: string[];
    /** hostnames, IPs or IPv4 CIDRs that a drift webhook may reach even if private; separate from the database list */
    webhookAllowHosts: string[];
    /** secret for encrypting saved connection passwords; null disables saving */
    connectionKey: string | null;
    /**
     * Secret for encrypting authenticator secrets: SECRETS_KEY, else the
     * connection key. null = nobody can set two-factor up (not an error).
     */
    secretsKey: string | null;
    /** false removes two-factor completely: no endpoints, no UI */
    mfaEnabled: boolean;
    /** 30-second steps a code is accepted either side of now (clock drift) */
    mfaWindowSteps: number;
    /**
     * How long a drift report may stand in for a new check when a diagram is
     * opened, in seconds, as long as the diagram and its settings did not
     * change. 0 always reads the database.
     */
    driftCacheSeconds: number;
}

/** Whole steps, 0 to 5; anything else is the default of 1. */
export function parseWindowSteps(value: string | undefined): number {
    const n = Number(value);
    return value?.trim() && Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}

export function parseCookieSecure(
    value: string | undefined
): boolean | 'auto' {
    const v = value?.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
    return 'auto';
}

export function parseTrustProxy(
    value: string | undefined
): boolean | number | string[] {
    const v = value?.trim();
    if (!v || v === 'false') return false;
    if (v === 'true') return true;
    if (/^\d+$/.test(v)) return Number(v);
    return v
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
}

/**
 * Settings the server runs on but that probably leave something weaker than the
 * operator expects. Printed once at start; none of them stops the server.
 */
export function startupWarnings(
    config: Pick<
        Config,
        'cookieSecure' | 'trustProxy' | 'connectionKey' | 'secretsKey'
    >
): string[] {
    const warnings: string[] = [];
    const noProxy =
        config.trustProxy === false ||
        (Array.isArray(config.trustProxy) && config.trustProxy.length === 0);
    // 'auto' sets Secure only on a request that arrived over https, and behind a
    // TLS-terminating proxy every request reaches the server as plain http
    // unless the proxy is trusted: the session cookie then goes out without
    // Secure
    if (config.cookieSecure === 'auto' && noProxy) {
        warnings.push(
            'COOKIE_SECURE=auto and TRUST_PROXY is not set: behind a reverse proxy that ends TLS ' +
                'the session cookie is sent without the Secure flag. ' +
                'Set TRUST_PROXY to the number of proxies in front of the server, or COOKIE_SECURE=true.'
        );
    }
    // the key is the only entropy in the derived encryption key, and old data
    // is sealed with it, so a short key is warned about and not refused
    for (const [name, value] of [
        ['CONNECTION_KEY', config.connectionKey],
        ['SECRETS_KEY', config.secretsKey],
    ] as const) {
        if (value === null) continue;
        // SECRETS_KEY falls back to CONNECTION_KEY: one warning per value
        if (name === 'SECRETS_KEY' && value === config.connectionKey) continue;
        if (value.length < RECOMMENDED_KEY_LENGTH) {
            warnings.push(
                `${name} is ${value.length} characters; use at least ${RECOMMENDED_KEY_LENGTH} ` +
                    '(for example `openssl rand -hex 24`). Changing it makes saved values unreadable, so re-enter them after a change.'
            );
        }
    }
    return warnings;
}

/** Thrown by `loadConfig` when the environment holds values the server cannot run on. */
export class ConfigError extends Error {
    constructor(problems: string[]) {
        super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
        this.name = 'ConfigError';
    }
}

/** Shortest encryption key `CryptoBox` accepts. */
const MIN_KEY_LENGTH = 16;

/** Length from which a key is no longer warned about at start. */
const RECOMMENDED_KEY_LENGTH = 32;

/** The levels the logger knows; anything else makes it throw at start-up. */
export const LOG_LEVELS = [
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const problems: string[] = [];
    // An unset or empty variable takes the default; anything else must be a
    // whole number in range, so a typo cannot turn a limit into NaN
    const int = (key: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
        const raw = env[key]?.trim();
        if (!raw) return fallback;
        const n = Number(raw);
        if (!Number.isInteger(n) || n < min || n > max) {
            problems.push(`${key} must be a whole number from ${min} to ${max} (got "${raw}")`);
            return fallback;
        }
        return n;
    };
    const allowList = (name: string) => {
        const hosts = (env[name] ?? '')
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean);
        for (const entry of hosts) {
            const why = allowEntryProblem(entry);
            if (why) problems.push(`${name} entry "${entry}": ${why}`);
        }
        return hosts;
    };
    const introspectAllowHosts = allowList('INTROSPECT_ALLOW_HOSTS');
    const webhookAllowHosts = allowList('WEBHOOK_ALLOW_HOSTS');
    // the browser's Origin header is scheme://host[:port] with nothing after it,
    // and the server compares it as text: `*`, a path or a trailing slash would
    // match no request and fail every credentialed call without saying why
    const corsOrigin = env.CORS_ORIGIN?.trim() || null;
    if (corsOrigin !== null) {
        let exact = false;
        try {
            const url = new URL(corsOrigin);
            exact = /^https?:$/.test(url.protocol) && url.origin === corsOrigin;
        } catch {
            // not a URL at all
        }
        if (!exact) {
            problems.push(
                `CORS_ORIGIN must be one exact origin such as https://editor.example.com, with no path or trailing slash (got "${corsOrigin}")`
            );
        }
    }
    const key = (name: string) => {
        const value = env[name] || null;
        if (value !== null && value.length < MIN_KEY_LENGTH) {
            problems.push(`${name} must be at least ${MIN_KEY_LENGTH} characters`);
        }
        return value;
    };

    const logLevel = (env.LOG_LEVEL?.trim() || 'info').toLowerCase();
    if (!(LOG_LEVELS as readonly string[]).includes(logLevel)) {
        problems.push(
            `LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')} (got "${env.LOG_LEVEL?.trim()}")`
        );
    }

    // a setting that is present must be one the server understands: a typo
    // such as COOKIE_SECURE=ture would otherwise quietly mean "auto"
    const oneOf = (name: string, allowed: readonly string[]) => {
        const raw = env[name]?.trim();
        if (raw && !allowed.includes(raw.toLowerCase())) {
            problems.push(`${name} must be one of ${allowed.join(', ')} (got "${raw}")`);
        }
    };
    oneOf('COOKIE_SECURE', ['true', 'false', 'auto']);
    oneOf('MFA_ENABLED', ['true', 'false']);
    if (env.MFA_WINDOW_STEPS?.trim()) {
        const steps = Number(env.MFA_WINDOW_STEPS.trim());
        if (!Number.isInteger(steps) || steps < 0 || steps > 5) {
            problems.push(
                `MFA_WINDOW_STEPS must be a whole number from 0 to 5 (got "${env.MFA_WINDOW_STEPS.trim()}")`
            );
        }
    }

    // `true` would believe the first X-Forwarded-For entry, which is whatever
    // the visitor sent: a new value per request is a new rate-limit bucket and a
    // new lockout key, so the limits would mean nothing
    const trustProxy = parseTrustProxy(env.TRUST_PROXY);
    if (trustProxy === true) {
        problems.push(
            'TRUST_PROXY=true trusts an X-Forwarded-For header that any visitor can send; ' +
                'set the number of proxies in front of the server (1 for a single reverse proxy) or their addresses'
        );
    }

    // no built-in fallback: a default credential would be a known password
    const databaseUrl = env.DATABASE_URL?.trim() ?? '';
    if (!databaseUrl) problems.push('DATABASE_URL is required');
    const connectionKey = key('CONNECTION_KEY');
    const secretsKey = key('SECRETS_KEY') ?? connectionKey;
    const config: Config = {
        databaseUrl,
        // loopback unless told otherwise; the Docker image sets 0.0.0.0
        host: env.HOST ?? '127.0.0.1',
        port: int('PORT', 3001, 1, 65535),
        corsOrigin,
        webDir: env.WEB_DIR?.trim() || null,
        sessionDays: int('SESSION_DAYS', 30, 1, 3650),
        sessionIdleDays: int('SESSION_IDLE_DAYS', 14),
        lintRateLimit: int('LINT_RATE_LIMIT', 30, 1),
        outboundRateLimit: int('OUTBOUND_RATE_LIMIT', 20, 1),
        snapshotKeep: int('SNAPSHOT_KEEP', 200),
        driftReportKeep: int('DRIFT_REPORT_KEEP', 50),
        bodyLimit: int('BODY_LIMIT_KB', 1024, 1) * 1024,
        diagramBodyLimit: int('DIAGRAM_BODY_LIMIT_MB', 50, 1) * 1024 * 1024,
        auditRetentionDays: int('AUDIT_RETENTION_DAYS', 365),
        deadLinkKeepDays: int('DEAD_LINK_KEEP_DAYS', 30),
        cookieSecure: parseCookieSecure(env.COOKIE_SECURE),
        authRateLimit: int('AUTH_RATE_LIMIT', 20, 1),
        authMaxFailures: int('AUTH_MAX_FAILURES', 10, 1),
        authLockoutMinutes: int('AUTH_LOCKOUT_MINUTES', 15, 1),
        passwordMinLength: normalizeMinLength(
            env.PASSWORD_MIN_LENGTH?.trim()
                ? int('PASSWORD_MIN_LENGTH', 0, 1, 1024)
                : undefined
        ),
        sseMaxPerLink: int('SSE_MAX_PER_LINK', 100, 1),
        sseMaxPerIp: int('SSE_MAX_PER_IP', 20, 1),
        sseHeartbeatSeconds: int('SSE_HEARTBEAT_SECONDS', 25, 1),
        trustProxy,
        logLevel,
        dbPoolMax: int('DB_POOL_MAX', 10, 2),
        auditSaveMinutes: int('AUDIT_SAVE_MINUTES', 60),
        autoPublishCoalesceSeconds: int('AUTO_PUBLISH_COALESCE_SECONDS', 300),
        dbStatementTimeoutSeconds: int('DB_STATEMENT_TIMEOUT_SECONDS', 120),
        shareRateLimit: int('SHARE_RATE_LIMIT', 60, 1),
        introspectAllowHosts,
        webhookAllowHosts,
        connectionKey,
        secretsKey,
        mfaEnabled: env.MFA_ENABLED?.trim().toLowerCase() !== 'false',
        mfaWindowSteps: parseWindowSteps(env.MFA_WINDOW_STEPS),
        driftCacheSeconds: int('DRIFT_CACHE_SECONDS', 300),
    };
    if (problems.length > 0) throw new ConfigError(problems);
    return config;
}
