import { normalizeMinLength } from '../../shared/password.js';

export interface Config {
    databaseUrl: string;
    /** interface the HTTP server listens on */
    host: string;
    port: number;
    corsOrigin: string | null;
    sessionDays: number;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    return {
        databaseUrl:
            env.DATABASE_URL ??
            'postgres://qubdidb:qubdidb@localhost:5433/qubdidb',
        host: env.HOST ?? '0.0.0.0',
        port: Number(env.PORT ?? 3001),
        corsOrigin: env.CORS_ORIGIN ?? null,
        sessionDays: Number(env.SESSION_DAYS ?? 30),
        lintRateLimit: Number(env.LINT_RATE_LIMIT ?? 30),
        outboundRateLimit: Number(env.OUTBOUND_RATE_LIMIT ?? 20),
        snapshotKeep: Number(env.SNAPSHOT_KEEP ?? 200),
        driftReportKeep: Number(env.DRIFT_REPORT_KEEP ?? 50),
        bodyLimit: Number(env.BODY_LIMIT_KB ?? 1024) * 1024,
        diagramBodyLimit: Number(env.DIAGRAM_BODY_LIMIT_MB ?? 50) * 1024 * 1024,
        auditRetentionDays: Number(env.AUDIT_RETENTION_DAYS ?? 365),
        deadLinkKeepDays: Number(env.DEAD_LINK_KEEP_DAYS ?? 30),
        cookieSecure: parseCookieSecure(env.COOKIE_SECURE),
        authRateLimit: Number(env.AUTH_RATE_LIMIT ?? 20),
        authMaxFailures: Number(env.AUTH_MAX_FAILURES ?? 10),
        authLockoutMinutes: Number(env.AUTH_LOCKOUT_MINUTES ?? 15),
        passwordMinLength: normalizeMinLength(
            env.PASSWORD_MIN_LENGTH ? Number(env.PASSWORD_MIN_LENGTH) : undefined
        ),
        sseMaxPerLink: Number(env.SSE_MAX_PER_LINK ?? 100),
        trustProxy: parseTrustProxy(env.TRUST_PROXY),
        logLevel: env.LOG_LEVEL ?? 'info',
        dbPoolMax: Number(env.DB_POOL_MAX ?? 10),
        shareRateLimit: Number(env.SHARE_RATE_LIMIT ?? 60),
        introspectAllowHosts: (env.INTROSPECT_ALLOW_HOSTS ?? '')
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean),
        connectionKey: env.CONNECTION_KEY ?? null,
        secretsKey: env.SECRETS_KEY || env.CONNECTION_KEY || null,
        mfaEnabled: env.MFA_ENABLED?.trim().toLowerCase() !== 'false',
        mfaWindowSteps: parseWindowSteps(env.MFA_WINDOW_STEPS),
        driftCacheSeconds: Number(env.DRIFT_CACHE_SECONDS ?? 300),
    };
}
