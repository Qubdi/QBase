import { normalizeMinLength } from '../../shared/password.js';

export interface Config {
    databaseUrl: string;
    /** interface the HTTP server listens on */
    host: string;
    port: number;
    corsOrigin: string | null;
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
    /** max requests per minute per IP on the public share routes */
    shareRateLimit: number;
    /** hostnames, IPs or IPv4 CIDRs that introspection may reach even if private */
    introspectAllowHosts: string[];
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

/** Thrown by `loadConfig` when the environment holds values the server cannot run on. */
export class ConfigError extends Error {
    constructor(problems: string[]) {
        super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
        this.name = 'ConfigError';
    }
}

/** Shortest encryption key `CryptoBox` accepts. */
const MIN_KEY_LENGTH = 16;

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
    const key = (name: string) => {
        const value = env[name] || null;
        if (value !== null && value.length < MIN_KEY_LENGTH) {
            problems.push(`${name} must be at least ${MIN_KEY_LENGTH} characters`);
        }
        return value;
    };

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
        corsOrigin: env.CORS_ORIGIN ?? null,
        sessionDays: int('SESSION_DAYS', 30, 1),
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
        trustProxy: parseTrustProxy(env.TRUST_PROXY),
        logLevel: env.LOG_LEVEL ?? 'info',
        dbPoolMax: int('DB_POOL_MAX', 10, 1),
        shareRateLimit: int('SHARE_RATE_LIMIT', 60, 1),
        introspectAllowHosts: (env.INTROSPECT_ALLOW_HOSTS ?? '')
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean),
        connectionKey,
        secretsKey,
        mfaEnabled: env.MFA_ENABLED?.trim().toLowerCase() !== 'false',
        mfaWindowSteps: parseWindowSteps(env.MFA_WINDOW_STEPS),
        driftCacheSeconds: int('DRIFT_CACHE_SECONDS', 300),
    };
    if (problems.length > 0) throw new ConfigError(problems);
    return config;
}
