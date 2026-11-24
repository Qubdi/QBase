import type { Config } from '../config.js';

/**
 * QBase's side of QAuth (AUTH_PROVIDER=qauth): the calls this server makes to
 * QAuth's REST API on behalf of its own sign-in screens. QAuth knows who the
 * person is (passwords, two-factor, resets); what a person may do in QBase stays
 * QBase's own (its admins, project and diagram access), keyed on QAuth's person id.
 *
 * QAuth throttles by client address, and this server is the client it sees: it
 * is told the browser's address in X-Forwarded-For, which QAuth believes only
 * from the proxies it trusts (QAUTH_TRUSTED_PROXIES there).
 */

export interface QauthTokens {
    accessToken: string;
    refreshToken: string | null;
    mustChangePassword: boolean;
    mfaEnrollmentRequired: boolean;
}

export type QauthLogin =
    | { kind: 'ok'; tokens: QauthTokens }
    | { kind: 'mfa'; ticket: string };

export interface QauthPerson {
    id: string;
    email: string;
    displayName: string;
    /** QAuth has checked that the person controls this address */
    emailVerified: boolean;
}

/** QAuth refused, or could not be asked. `code` is QAuth's error code; `status` its HTTP status (0: no answer). */
export class QauthError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        readonly retryAfter?: number,
        readonly extra?: Record<string, unknown>
    ) {
        super(`QAuth answered ${status} ${code}`);
        this.name = 'QauthError';
    }
    /** a person's mistake (wrong password, bad code, locked out), not a fault */
    get refused() {
        return this.status >= 400 && this.status < 500 && this.status !== 404;
    }
}

export interface QauthClient {
    login(email: string, password: string, ip: string): Promise<QauthLogin>;
    verifyMfa(ticket: string, code: string, ip: string): Promise<QauthTokens>;
    refresh(refreshToken: string, ip: string): Promise<QauthTokens>;
    me(accessToken: string): Promise<QauthPerson>;
    logout(accessToken: string): Promise<void>;
    changePassword(
        accessToken: string,
        currentPassword: string,
        newPassword: string,
        mfaCode: string | undefined
    ): Promise<void>;
    /** confirms the signed-in person's password (and code) for something that needs it */
    stepUp(accessToken: string, password: string, code: string | undefined): Promise<void>;
}

type Fetch = typeof fetch;

interface Reply {
    status: number;
    body: Record<string, unknown>;
    retryAfter?: number;
}

export function createQauthClient(
    config: Pick<Config, 'qauthUrl' | 'qauthClientId'>,
    fetchImpl: Fetch = fetch
): QauthClient {
    if (!config.qauthUrl || !config.qauthClientId) {
        throw new Error('AUTH_PROVIDER=qauth needs QAUTH_URL and QAUTH_CLIENT_ID');
    }
    const base = config.qauthUrl;
    const clientId = config.qauthClientId;

    async function call(
        method: 'GET' | 'POST',
        path: string,
        opts: { body?: unknown; bearer?: string; ip?: string } = {}
    ): Promise<Reply> {
        const headers: Record<string, string> = { accept: 'application/json' };
        if (opts.body !== undefined) headers['content-type'] = 'application/json';
        if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
        if (opts.ip) headers['x-forwarded-for'] = opts.ip;
        let res: Response;
        try {
            res = await fetchImpl(`${base}/auth${path}`, {
                method,
                headers,
                body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
                redirect: 'manual',
                signal: AbortSignal.timeout(10_000),
            });
        } catch {
            throw new QauthError(0, 'unreachable');
        }
        const text = await res.text();
        let body: Record<string, unknown> = {};
        try {
            body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
            if (res.ok) throw new QauthError(502, 'bad_answer');
        }
        const retry = Number(res.headers.get('retry-after'));
        return { status: res.status, body, retryAfter: Number.isFinite(retry) && retry > 0 ? retry : undefined };
    }

    const fail = (r: Reply): never => {
        const err = (r.body.error ?? {}) as { code?: string } & Record<string, unknown>;
        throw new QauthError(r.status, typeof err.code === 'string' ? err.code : 'error', r.retryAfter, err);
    };

    const tokensOf = (b: Record<string, unknown>): QauthTokens => {
        if (typeof b.access_token !== 'string') throw new QauthError(502, 'bad_answer');
        return {
            accessToken: b.access_token,
            refreshToken: typeof b.refresh_token === 'string' ? b.refresh_token : null,
            mustChangePassword: b.must_change_password === true,
            mfaEnrollmentRequired: b.mfa_enrollment_required === true,
        };
    };

    const loginOf = (r: Reply): QauthLogin => {
        if (r.status !== 200) return fail(r);
        if (r.body.status === 'mfa_required' && typeof r.body.mfa_ticket === 'string') {
            return { kind: 'mfa', ticket: r.body.mfa_ticket };
        }
        return { kind: 'ok', tokens: tokensOf(r.body) };
    };

    return {
        async login(email, password, ip) {
            return loginOf(
                await call('POST', '/login', { body: { email, password, client_id: clientId }, ip })
            );
        },
        async verifyMfa(ticket, code, ip) {
            const r = await call('POST', '/mfa/verify', { body: { ticket, code }, ip });
            const out = loginOf(r);
            if (out.kind !== 'ok') throw new QauthError(502, 'bad_answer');
            return out.tokens;
        },
        async refresh(refreshToken, ip) {
            const r = await call('POST', '/refresh', { body: { refresh_token: refreshToken }, ip });
            if (r.status !== 200) return fail(r);
            return tokensOf(r.body);
        },
        async me(accessToken) {
            const r = await call('GET', '/me', { bearer: accessToken });
            if (r.status !== 200) return fail(r);
            const u = r.body.user as Record<string, unknown> | undefined;
            if (!u || typeof u.id !== 'string' || typeof u.email !== 'string') {
                throw new QauthError(502, 'bad_answer');
            }
            return {
                id: u.id,
                email: u.email.toLowerCase(),
                displayName: typeof u.display_name === 'string' ? u.display_name : '',
                emailVerified: u.email_verified === true,
            };
        },
        async logout(accessToken) {
            const r = await call('POST', '/logout', { bearer: accessToken });
            // already signed out there is the result that was asked for
            if (r.status !== 204 && r.status !== 200 && r.status !== 401) fail(r);
        },
        async changePassword(accessToken, currentPassword, newPassword, mfaCode) {
            const r = await call('POST', '/change-password', {
                bearer: accessToken,
                body: { current_password: currentPassword, new_password: newPassword, mfa_code: mfaCode },
            });
            if (r.status !== 204 && r.status !== 200) fail(r);
        },
        async stepUp(accessToken, password, code) {
            const r = await call('POST', '/step-up', {
                bearer: accessToken,
                body: { password, mfa_code: code },
            });
            if (r.status !== 200 && r.status !== 204) fail(r);
        },
    };
}
