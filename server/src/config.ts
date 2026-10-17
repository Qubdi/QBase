export interface Config {
    databaseUrl: string;
    sessionSecret: string;
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
    /** largest request body on ordinary routes, in bytes */
    bodyLimit: number;
    /** largest request body on the routes that carry a whole diagram, in bytes */
    diagramBodyLimit: number;
    /** audit rows older than this many days are deleted; 0 keeps them all */
    auditRetentionDays: number;
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
     * How long a drift report may stand in for a new check when a diagram is
     * opened, in seconds, as long as the diagram and its settings did not
     * change. 0 always reads the database.
     */
    driftCacheSeconds: number;
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
        sessionSecret: env.SESSION_SECRET ?? 'dev-secret-change-me',
        host: env.HOST ?? '0.0.0.0',
        port: Number(env.PORT ?? 3001),
        corsOrigin: env.CORS_ORIGIN ?? null,
        sessionDays: Number(env.SESSION_DAYS ?? 30),
        lintRateLimit: Number(env.LINT_RATE_LIMIT ?? 30),
        outboundRateLimit: Number(env.OUTBOUND_RATE_LIMIT ?? 20),
        snapshotKeep: Number(env.SNAPSHOT_KEEP ?? 200),
        bodyLimit: Number(env.BODY_LIMIT_KB ?? 1024) * 1024,
        diagramBodyLimit: Number(env.DIAGRAM_BODY_LIMIT_MB ?? 50) * 1024 * 1024,
        auditRetentionDays: Number(env.AUDIT_RETENTION_DAYS ?? 365),
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
        driftCacheSeconds: Number(env.DRIFT_CACHE_SECONDS ?? 300),
    };
}
