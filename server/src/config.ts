export interface Config {
    databaseUrl: string;
    sessionSecret: string;
    /** interface the HTTP server listens on */
    host: string;
    port: number;
    corsOrigin: string | null;
    sessionDays: number;
    /** max requests per minute per IP on the public share routes */
    shareRateLimit: number;
    /** hostnames, IPs or IPv4 CIDRs that introspection may reach even if private */
    introspectAllowHosts: string[];
    /** secret for encrypting saved connection passwords; null disables saving */
    connectionKey: string | null;
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
        shareRateLimit: Number(env.SHARE_RATE_LIMIT ?? 60),
        introspectAllowHosts: (env.INTROSPECT_ALLOW_HOSTS ?? '')
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean),
        connectionKey: env.CONNECTION_KEY ?? null,
    };
}
