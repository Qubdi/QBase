import { z } from 'zod';
import { QUBDI_BACKEND_URL } from './config';
import { i18n } from '@/i18n/i18n';
import type { LintConfig } from '../../../shared/lint';
import * as shape from './api-schemas';
import { gzipText } from './gzip';
import { listQuery, type ListParams, type Page } from './paging';
import { InvalidServerDiagramError } from './open-remote';

export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface RemoteUser {
    id: string;
    email: string;
    isAdmin: boolean;
    /** the password is a temporary one an admin chose: only changing it works until then */
    mustChangePassword: boolean;
    /** signing in asks for a code from an authenticator app (absent = off) */
    mfaEnabled?: boolean;
}

/** What POST /auth/login answers: signed in, or a ticket for the code step. */
export type LoginResult = RemoteUser | { mfaRequired: true; challenge: string };

/** One second factor: a code from the app, or one recovery code. */
export type SecondFactor = { code: string } | { recoveryCode: string };

/** The account's own two-factor state (GET /auth/mfa). */
export interface MfaStatus {
    /** the server offers it (switched on and has a key) */
    available: boolean;
    enabled: boolean;
    enabledAt: string | null;
    recoveryCodesLeft: number;
}

export type ProjectRole = 'editor' | 'viewer';

/** A project the signed-in user can work in. Admins are 'owner' everywhere. */
export interface MyProject {
    id: string;
    name: string;
    /** the project's URL piece: /<slug>/diagrams */
    slug: string;
    description: string;
    /** how many diagrams the project holds */
    diagramCount: number;
    role: MemberRole;
}

export interface AdminUser {
    id: string;
    email: string;
    isAdmin: boolean;
    /** a disabled user cannot sign in */
    isActive: boolean;
    createdAt: string;
    /** the last time they signed in; null if they never have */
    lastLoginAt: string | null;
    /** when their live session was last used; null when they are not signed in */
    lastActiveAt: string | null;
    /** number of projects the user is assigned to */
    projects: number;
    /** signs in with an authenticator app as well as the password (absent = off) */
    mfaEnabled?: boolean;
}

export type UserStatus = 'active' | 'disabled';

/** One sign-in of a user, as an admin may see it (no id, no token). */
export interface AdminSession {
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
    /** the browser's User-Agent; null when it did not say */
    userAgent: string | null;
}

export type BulkUserAction = 'enable' | 'disable' | 'delete';

export interface BulkUsersResult {
    /** accounts the action was done to */
    changed: number;
    /** accounts left alone: already in that state, or no longer there */
    unchanged: number;
}

export interface AdminProject {
    id: string;
    name: string;
    slug: string;
    description: string;
    createdAt: string;
    members: number;
    diagrams: number;
}

export interface ProjectMember {
    userId: string;
    email: string;
    role: ProjectRole;
}

/** The figures on the admin Overview. */
export interface AdminStats {
    users: {
        total: number;
        /** accounts that can sign in */
        active: number;
        admins: number;
        /** people with a live session right now */
        signedIn: number;
    };
    projects: number;
    diagrams: {
        total: number;
        /** diagrams with at least one published version */
        published: number;
    };
    /** share links that can be opened right now */
    activeLinks: number;
    /** diagrams someone has open for editing right now */
    editingNow: number;
    /** database drift checks run in the last 24 hours */
    driftChecks24h: number;
    activity: {
        timeZone: string;
        /** events per day, oldest first and today last; saves are not counted */
        days: { day: string; events: number }[];
    };
}

/** A diagram as the admin Diagrams page lists it (never its content). */
export interface AdminDiagram {
    id: string;
    title: string;
    projectId: string;
    projectName: string | null;
    /** the project's web address, for a link into the editor */
    projectSlug: string | null;
    ownerId: string;
    ownerEmail: string | null;
    updatedAt: string;
    /** the newest published version; null if it was never published */
    publishedVersion: number | null;
    /** who has it open for editing right now */
    editingBy: { userId: string; email: string | null } | null;
    /** share links that can be opened right now */
    activeLinks: number;
}

export type ShareLinkStatus = 'active' | 'off' | 'expired' | 'revoked';

/** A share link as an admin sees it: its state and who made it, never its address. */
export interface AdminShareLink {
    id: string;
    access: 'anyone' | 'signed_in' | 'off';
    /** viewers on it are sent each new version as it is published */
    live: boolean;
    expiresAt: string | null;
    createdAt: string;
    revokedAt: string | null;
    createdById: string | null;
    createdByEmail: string | null;
    status: ShareLinkStatus;
}

/** The kinds of action the Activity filter offers; the server defines them. */
export type ActivityGroup =
    'users' | 'projects' | 'diagrams' | 'sharing' | 'checks' | 'exports';

/** One line of the audit log, with the names behind its ids (null when gone). */
export interface ActivityItem {
    id: number;
    at: string;
    /** `diagram.publish`, `project.member_set` and so on */
    action: string;
    userId: string | null;
    userEmail: string | null;
    diagramId: string | null;
    diagramTitle: string | null;
    projectId: string | null;
    projectName: string | null;
    /** the person an admin acted on (not the one who acted) */
    targetUserId: string | null;
    targetUserEmail: string | null;
    meta: {
        role?: ProjectRole;
        version?: number;
        access?: 'anyone' | 'signed_in' | 'off';
        /** share.revoke: when the link was made */
        madeAt?: string;
        changed?: ('password' | 'isAdmin' | 'isActive')[];
        isAdmin?: boolean;
        /** drift.configure: what happened to the webhook (its host is in `host`) */
        webhook?: 'set' | 'changed' | 'cleared';
        /** a saved connection's name, for the connection actions */
        name?: string;
        /** audit.export: how many rows the file held */
        rows?: number;
        /** introspect.run: the kind of database and the host it was read from */
        dialect?: DbDialect;
        host?: string;
    } | null;
}

export interface ActivityPage {
    items: ActivityItem[];
    /** pass back as `cursor` for the next, older page; null on the last */
    nextCursor: string | null;
}

export interface ActivityParams {
    limit?: number;
    cursor?: string | null;
    group?: ActivityGroup;
    /** who did it */
    userId?: string;
    diagramId?: string;
    /** ISO times, both ends included */
    from?: string;
    to?: string;
    /** `hide` leaves out saves, which are by far the most frequent action */
    saves?: 'show' | 'hide';
}

export interface RemoteDiagramSummary {
    id: string;
    title: string;
    updatedAt: string;
    ownerId: string;
    /** set when the diagram lives in a project; access then follows the project */
    projectId?: string | null;
    role: MemberRole;
    // what the list shows about the diagram (read from its content; for
    // viewers, from the published copy). Missing on very old servers.
    ownerEmail?: string | null;
    databaseType?: string | null;
    databaseEdition?: string | null;
    tableCount?: number;
    relationshipCount?: number;
    /** when the diagram was first created */
    createdAt?: string | null;
}

export interface RemoteDiagram extends RemoteDiagramSummary {
    content: Record<string, unknown> | null;
    publishedVersion: number | null;
    publishedAt: string | null;
    /** Only present for owners and editors. */
    unpublishedChanges?: boolean;
    autoPublish?: boolean;
}

export interface RemoteMember {
    userId: string;
    email: string;
    role: MemberRole;
}

export type ShareAccess = 'anyone' | 'signed_in' | 'off';

export interface RemoteShareLink {
    id: string;
    diagramId: string;
    access: ShareAccess;
    expiresAt: string | null;
    live: boolean;
    createdAt: string;
    revokedAt: string | null;
    /** an active link's token, when the server can keep it (CONNECTION_KEY is set) */
    token?: string;
}

/** Returned on create and regenerate. */
export interface RemoteShareLinkWithToken extends RemoteShareLink {
    token: string;
}

export interface PublicShare {
    title: string;
    content: Record<string, unknown>;
    version: number;
    publishedAt: string;
    live: boolean;
}

export type PublicShareResult =
    | { status: 'ok'; share: PublicShare }
    | { status: 'login_required' }
    | { status: 'not_found' }
    | { status: 'not_published' }
    | { status: 'error' };

export class ApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        /** human readable detail from the server, when it sends one */
        public detail?: string
    ) {
        super(detail ?? code);
    }
}

export type DbDialect = 'postgresql' | 'sqlserver';

export type DriftSeverity = 'breaking' | 'warning' | 'info';
export type DriftCategory = 'only_in_database' | 'only_in_diagram' | 'differs';
export type DriftStatus = 'clean' | 'drifted' | 'error';

export interface DriftItem {
    id: string;
    kind: string;
    category: DriftCategory;
    severity: DriftSeverity;
    summary: string;
}

export interface DriftReportSummary {
    id: string;
    runAt: string;
    status: DriftStatus;
    trigger: 'manual' | 'schedule';
    counts: Record<DriftSeverity, number>;
    worst: DriftSeverity | null;
    error: string | null;
    dismissedAt: string | null;
    webhook: string | null;
}

export interface DriftReport extends DriftReportSummary {
    changes: DriftItem[];
    renameHints: string[];
}

export interface DriftBadge {
    status: Exclude<DriftStatus, 'clean'>;
    counts: Record<DriftSeverity, number>;
    reportId: string;
}

/** What a check answers with: its report, and the badge the diagram shows once it is stored. */
export interface DriftCheckResult extends DriftReport {
    badge: DriftBadge | null;
}

export interface DriftSettings {
    connectionId: string | null;
    schemas: string[];
    tables: string[];
    sourceKeys: {
        tables: Record<string, string>;
        columns: Record<string, string>;
    };
    /** Left out keeps the saved webhook; null clears it. Never sent back by the server. */
    webhookUrl?: string | null;
    /** Where the saved webhook points: the path and query stay on the server. */
    webhookHost?: string | null;
}

export interface DriftOverview {
    settings: DriftSettings | null;
    latest: DriftReportSummary | null;
    badge: DriftBadge | null;
}

export interface DbConnectionInput {
    dialect: DbDialect;
    host: string;
    port?: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
    trustServerCertificate: boolean;
}

export interface SavedConnection {
    id: string;
    name: string;
    dialect: DbDialect;
    host: string;
    port: number;
    database: string;
    user: string;
    ssl: boolean;
    trustServerCertificate: boolean;
    createdAt: string;
}

/** Credentials inline, or a saved connection (optionally with a password override). */
export type ConnectionRef =
    | { connection: DbConnectionInput }
    | { savedConnectionId: string; password?: string };

export interface CatalogResponse {
    dialect: DbDialect;
    database: string;
    schemas: Array<{ schema: string; tables: string[]; views: string[] }>;
}

type FetchLike = typeof fetch;

// Called when a signed-in request is refused as signed out: the session ended,
// for instance because the account signed in somewhere else.
/** The calls a person makes before they have a session, where 401 is an ordinary answer. */
const SIGNED_OUT_PATHS: ReadonlySet<string> = new Set([
    '/auth/setup-status',
    '/auth/register',
    '/auth/login',
    '/auth/login/mfa',
    '/auth/me',
]);

let sessionEndedHandler: (() => void) | null = null;
export const setSessionEndedHandler = (fn: (() => void) | null) => {
    sessionEndedHandler = fn;
};

/** How long any API request may take before it is given up. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Browsers cap the body of a keepalive request at 64 KiB. */
export const KEEPALIVE_BODY_LIMIT = 60_000;

// the browser's cap counts bytes; `string.length` counts UTF-16 units, which
// is a third of the bytes for Georgian and other non-Latin text
const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

/** The one route that inflates a gzipped body: the save of a diagram. */
const acceptsGzip = (method: string, path: string) =>
    method === 'PUT' && /^\/diagrams\/[^/?]+$/.test(path);

export interface RequestOptions {
    /** Let the request finish even if the page is closing (small bodies only). */
    keepalive?: boolean;
}

/**
 * Runtime checks for the answers the app cannot work without. Objects are
 * loose: a field the server adds later is kept, one it drops is caught.
 */
const remoteUserSchema = z.looseObject({
    id: z.string(),
    email: z.string(),
    isAdmin: z.boolean(),
    mustChangePassword: z.boolean(),
    mfaEnabled: z.boolean().optional(),
});
const loginResultSchema = z.union([
    remoteUserSchema,
    z.looseObject({ mfaRequired: z.literal(true), challenge: z.string() }),
]);
const setupStatusSchema = z.looseObject({
    needsSetup: z.boolean(),
    passwordMinLength: z.number(),
    mfaAvailable: z.boolean().optional(),
    // the first-run form shows its setup-token field only when this is true
    setupTokenRequired: z.boolean().optional(),
});
const mfaStatusSchema = z.looseObject({
    available: z.boolean(),
    enabled: z.boolean(),
    enabledAt: z.string().nullable(),
    recoveryCodesLeft: z.number(),
});
const membersSchema = z.array(
    z.looseObject({
        userId: z.string(),
        email: z.string(),
        role: z.enum(['owner', 'editor', 'viewer']),
    })
);

export function createApi(
    baseUrl: string = QUBDI_BACKEND_URL,
    fetchImpl: FetchLike = (...args) => fetch(...args)
) {
    async function request<T>(
        method: string,
        path: string,
        body?: unknown,
        options?: RequestOptions,
        /** when given, a successful answer must match it, or the call fails */
        schema?: z.ZodType<T>
    ): Promise<T> {
        const json = body === undefined ? undefined : JSON.stringify(body);
        // a request sent as the page closes (keepalive) may carry 64 KiB at most:
        // a bigger body is sent gzipped when that makes it fit, else as an
        // ordinary request that the page closing may cut off
        let payload: string | Uint8Array | undefined = json;
        let gzipped = false;
        let keepalive = false;
        if (options?.keepalive && json !== undefined) {
            if (utf8Bytes(json) <= KEEPALIVE_BODY_LIMIT) {
                keepalive = true;
            } else if (acceptsGzip(method, path)) {
                const packed = await gzipText(json);
                if (packed && packed.length <= KEEPALIVE_BODY_LIMIT) {
                    payload = packed;
                    gzipped = true;
                    keepalive = true;
                }
            }
        } else if (options?.keepalive) {
            keepalive = true;
        }
        const res = await fetchImpl(`${baseUrl}${path}`, {
            method,
            credentials: 'include',
            headers:
                body === undefined
                    ? {}
                    : {
                          'content-type': 'application/json',
                          ...(gzipped ? { 'content-encoding': 'gzip' } : {}),
                      },
            body: payload as BodyInit | undefined,
            // one hung request must not stall autosave behind it
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            ...(keepalive ? { keepalive: true } : {}),
        });
        if (res.status === 204) return undefined as T;
        const data = await res.json().catch(() => ({}));
        // Only the calls made while signed out answer 401 for ordinary reasons
        // (no session yet, wrong password, a bad second-step code). Any other
        // route, /auth/mfa and /auth/change-password included, answering 401
        // means the session is gone.
        if (res.status === 401 && !SIGNED_OUT_PATHS.has(path)) {
            sessionEndedHandler?.();
        }
        if (!res.ok) {
            throw new ApiError(
                res.status,
                data?.error ?? 'request_failed',
                typeof data?.message === 'string' ? data.message : undefined
            );
        }
        if (schema) {
            const parsed = schema.safeParse(data);
            if (!parsed.success)
                throw new ApiError(res.status, 'invalid_response');
            return parsed.data;
        }
        return data as T;
    }

    return {
        setupStatus: () =>
            request<{
                needsSetup: boolean;
                passwordMinLength: number;
                /** the server offers two-factor sign-in */
                mfaAvailable?: boolean;
                /** the first-run sign-up needs the setup token the server printed */
                setupTokenRequired?: boolean;
            }>(
                'GET',
                '/auth/setup-status',
                undefined,
                undefined,
                setupStatusSchema
            ),
        register: (email: string, password: string, setupToken?: string) =>
            request<RemoteUser>(
                'POST',
                '/auth/register',
                // the token is sent only when the server asked for one
                setupToken
                    ? { email, password, setupToken }
                    : { email, password },
                undefined,
                remoteUserSchema
            ),
        login: (email: string, password: string) =>
            request<LoginResult>(
                'POST',
                '/auth/login',
                { email, password },
                undefined,
                loginResultSchema
            ),
        /** The second step of signing in, with the ticket the password step gave. */
        loginMfa: (challenge: string, factor: SecondFactor) =>
            request<RemoteUser>(
                'POST',
                '/auth/login/mfa',
                { challenge, ...factor },
                undefined,
                remoteUserSchema
            ),
        mfaStatus: () =>
            request<MfaStatus>(
                'GET',
                '/auth/mfa',
                undefined,
                undefined,
                mfaStatusSchema
            ),
        /** A new secret, not yet on: the address for the QR code and the key to type. */
        mfaSetup: () =>
            request<{ secret: string; otpauthUrl: string }>(
                'POST',
                '/auth/mfa/setup',
                {},
                undefined,
                shape.mfaSetup
            ),
        /**
         * Checks the password and a code from the app, switches it on; the
         * recovery codes come back once. The password is what stops a stolen
         * session from switching it on.
         */
        mfaEnable: (password: string, code: string) =>
            request<{ recoveryCodes: string[] }>(
                'POST',
                '/auth/mfa/enable',
                { password, code },
                undefined,
                shape.recoveryCodes
            ),
        mfaDisable: (password: string, factor: SecondFactor) =>
            request<{ ok: true }>(
                'POST',
                '/auth/mfa/disable',
                { password, ...factor },
                undefined,
                shape.okAnswer
            ),
        mfaNewRecoveryCodes: (password: string, code: string) =>
            request<{ recoveryCodes: string[] }>(
                'POST',
                '/auth/mfa/recovery-codes',
                { password, code },
                undefined,
                shape.recoveryCodes
            ),
        logout: () =>
            request<{ ok: true }>(
                'POST',
                '/auth/logout',
                undefined,
                undefined,
                shape.okAnswer
            ),
        me: () =>
            request<RemoteUser>(
                'GET',
                '/auth/me',
                undefined,
                undefined,
                remoteUserSchema
            ),
        changePassword: (
            currentPassword: string,
            newPassword: string,
            /** asked for when the account has two-factor on */
            factor?: SecondFactor
        ) =>
            request<{ ok: true }>(
                'POST',
                '/auth/change-password',
                { currentPassword, newPassword, ...factor },
                undefined,
                shape.okAnswer
            ),

        /** Every diagram the user may see; `projectId` keeps one project's. */
        listDiagrams: (params?: { projectId?: string }) =>
            request<RemoteDiagramSummary[]>(
                'GET',
                `/diagrams${listQuery({}, { projectId: params?.projectId })}`,
                undefined,
                undefined,
                shape.diagramList
            ),
        /** One row of the list, without the content; 404 unless the user may see it. */
        getDiagramSummary: (id: string) =>
            request<RemoteDiagramSummary>(
                'GET',
                `/diagrams/${encodeURIComponent(id)}/summary`,
                undefined,
                undefined,
                shape.diagramSummary
            ),
        createDiagram: (
            title: string,
            content: Record<string, unknown>,
            projectId: string
        ) =>
            request<RemoteDiagram>(
                'POST',
                '/diagrams',
                { title, content, projectId },
                undefined,
                shape.remoteDiagram
            ),
        listProjects: (params?: ListParams) =>
            request<Page<MyProject>>(
                'GET',
                `/projects${listQuery(params)}`,
                undefined,
                undefined,
                shape.page(shape.myProject)
            ),
        /** One project by its web address or id; 404 unless the user may see it. */
        getProject: (ref: string) =>
            request<MyProject>(
                'GET',
                `/projects/${encodeURIComponent(ref)}`,
                undefined,
                undefined,
                shape.myProject
            ),

        // admin panel (admins only; everyone else gets a 404)
        adminListUsers: (params?: ListParams & { status?: UserStatus }) =>
            request<Page<AdminUser>>(
                'GET',
                `/admin/users${listQuery(params, { status: params?.status })}`,
                undefined,
                undefined,
                shape.page(shape.adminUser)
            ),
        adminCreateUser: (body: {
            email: string;
            password: string;
            isAdmin?: boolean;
        }) =>
            request<AdminUser>(
                'POST',
                '/admin/users',
                body,
                undefined,
                shape.adminUser
            ),
        adminUpdateUser: (
            id: string,
            body: { password?: string; isAdmin?: boolean; isActive?: boolean }
        ) =>
            request<{ id: string; isAdmin: boolean; isActive: boolean }>(
                'PATCH',
                `/admin/users/${encodeURIComponent(id)}`,
                body,
                undefined,
                shape.adminUserChange
            ),
        adminDeleteUser: (id: string) =>
            request<void>('DELETE', `/admin/users/${encodeURIComponent(id)}`),
        /** Enable, disable or delete up to 100 accounts; all or nothing. */
        adminBulkUsers: (action: BulkUserAction, ids: string[]) =>
            request<BulkUsersResult>(
                'POST',
                '/admin/users/bulk',
                { action, ids },
                undefined,
                shape.bulkUsersResult
            ),
        adminListUserSessions: (id: string) =>
            request<AdminSession[]>(
                'GET',
                `/admin/users/${encodeURIComponent(id)}/sessions`,
                undefined,
                undefined,
                z.array(shape.adminSession)
            ),
        /** Ends every session of the user; says how many were live. */
        adminSignOutUser: (id: string) =>
            request<{ signedOut: number }>(
                'DELETE',
                `/admin/users/${encodeURIComponent(id)}/sessions`,
                undefined,
                undefined,
                shape.signedOutCount
            ),
        /** Switches off a person's two-factor sign-in (lost phone) and signs them out. */
        adminResetMfa: (id: string) =>
            request<{ reset: boolean }>(
                'POST',
                `/admin/users/${encodeURIComponent(id)}/mfa/reset`,
                undefined,
                undefined,
                shape.resetResult
            ),
        /** `timeZone` makes a "day" on the chart the viewer's own. */
        adminStats: (timeZone?: string) =>
            request<AdminStats>(
                'GET',
                `/admin/stats${listQuery(undefined, { tz: timeZone })}`,
                undefined,
                undefined,
                shape.adminStats
            ),
        adminListDiagrams: (params?: ListParams & { projectId?: string }) =>
            request<Page<AdminDiagram>>(
                'GET',
                `/admin/diagrams${listQuery(params, { projectId: params?.projectId })}`,
                undefined,
                undefined,
                shape.page(shape.adminDiagram)
            ),
        adminListDiagramLinks: (id: string) =>
            request<AdminShareLink[]>(
                'GET',
                `/admin/diagrams/${encodeURIComponent(id)}/share-links`,
                undefined,
                undefined,
                z.array(shape.adminShareLink)
            ),
        /** Ends a share link at once, for anyone using it. */
        adminRevokeDiagramLink: (id: string, linkId: string) =>
            request<void>(
                'DELETE',
                `/admin/diagrams/${encodeURIComponent(id)}/share-links/${encodeURIComponent(linkId)}`
            ),
        adminListActivity: (params: ActivityParams = {}) =>
            request<ActivityPage>(
                'GET',
                `/admin/audit${listQuery(
                    { limit: params.limit },
                    {
                        cursor: params.cursor ?? undefined,
                        group: params.group,
                        userId: params.userId,
                        diagramId: params.diagramId,
                        from: params.from,
                        to: params.to,
                        saves: params.saves,
                    }
                )}`,
                undefined,
                undefined,
                shape.activityPage
            ),
        /**
         * The activity log as a CSV file, for the same filters as the list.
         * `truncated` means more rows matched than one file holds.
         */
        adminExportActivity: async (
            params: Omit<ActivityParams, 'limit' | 'cursor'> = {}
        ): Promise<{ blob: Blob; rows: number; truncated: boolean }> => {
            const res = await fetchImpl(
                `${baseUrl}/admin/audit/export${listQuery(undefined, {
                    group: params.group,
                    userId: params.userId,
                    diagramId: params.diagramId,
                    from: params.from,
                    to: params.to,
                    saves: params.saves,
                })}`,
                {
                    credentials: 'include',
                    // a long log takes a while to read
                    signal: AbortSignal.timeout(120_000),
                }
            );
            if (res.status === 401) sessionEndedHandler?.();
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new ApiError(res.status, data?.error ?? 'request_failed');
            }
            return {
                blob: await res.blob(),
                rows: Number(res.headers.get('x-row-count') ?? 0),
                truncated: res.headers.get('x-truncated') === 'true',
            };
        },
        adminListProjects: (params?: ListParams) =>
            request<Page<AdminProject>>(
                'GET',
                `/admin/projects${listQuery(params)}`,
                undefined,
                undefined,
                shape.page(shape.adminProject)
            ),
        adminCreateProject: (body: { name: string; description?: string }) =>
            request<AdminProject>(
                'POST',
                '/admin/projects',
                body,
                undefined,
                shape.adminProject
            ),
        adminUpdateProject: (
            id: string,
            body: { name?: string; description?: string }
        ) =>
            // the answer is the project row: the member and diagram counts are not in it
            request<Omit<AdminProject, 'members' | 'diagrams'>>(
                'PATCH',
                `/admin/projects/${encodeURIComponent(id)}`,
                body,
                undefined,
                shape.adminProjectRow
            ),
        adminDeleteProject: (id: string) =>
            request<void>(
                'DELETE',
                `/admin/projects/${encodeURIComponent(id)}`
            ),
        adminListProjectMembers: (id: string) =>
            request<ProjectMember[]>(
                'GET',
                `/admin/projects/${encodeURIComponent(id)}/members`,
                undefined,
                undefined,
                z.array(shape.projectMember)
            ),
        adminSetProjectMember: (
            id: string,
            userId: string,
            role: ProjectRole
        ) =>
            request<ProjectMember>(
                'PUT',
                `/admin/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
                { role },
                undefined,
                shape.projectMember
            ),
        adminRemoveProjectMember: (id: string, userId: string) =>
            request<void>(
                'DELETE',
                `/admin/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`
            ),
        getDiagram: (id: string) =>
            request<RemoteDiagram>(
                'GET',
                `/diagrams/${encodeURIComponent(id)}`,
                undefined,
                undefined,
                shape.remoteDiagram
            ),
        /** The publish badge's read: no content, so it is cheap after every save. */
        getPublishStatus: (id: string) =>
            request<
                Pick<
                    RemoteDiagram,
                    | 'publishedVersion'
                    | 'publishedAt'
                    | 'unpublishedChanges'
                    | 'autoPublish'
                >
            >(
                'GET',
                `/diagrams/${encodeURIComponent(id)}/publish-status`,
                undefined,
                undefined,
                shape.publishStatusOnly
            ),
        updateDiagram: (
            id: string,
            patch: {
                title?: string;
                content?: Record<string, unknown>;
                autoPublish?: boolean;
                /** `updatedAt` of the server copy the content is based on */
                baseUpdatedAt?: string;
                /** the open editor making the change, for the diagram's edit lock */
                editorId?: string;
            },
            options?: RequestOptions
        ) =>
            // the answer does not carry the content: the editor has it
            request<Omit<RemoteDiagram, 'content'>>(
                'PUT',
                `/diagrams/${encodeURIComponent(id)}`,
                patch,
                options,
                shape.savedDiagram
            ),
        /** Only one editor at a time: `held: false` means someone else has it. */
        acquireLock: (id: string, editorId: string) =>
            request<{ held: true } | { held: false; holder: string }>(
                'POST',
                `/diagrams/${encodeURIComponent(id)}/lock`,
                { editorId },
                undefined,
                shape.lockAnswer
            ),
        releaseLock: (id: string, editorId: string, options?: RequestOptions) =>
            request<void>(
                'DELETE',
                `/diagrams/${encodeURIComponent(id)}/lock?editorId=${encodeURIComponent(editorId)}`,
                undefined,
                options
            ),
        publish: (id: string, note?: string) =>
            request<{
                version: number;
                note: string | null;
                publishedAt: string;
            }>(
                'POST',
                `/diagrams/${encodeURIComponent(id)}/publish`,
                note ? { note } : {},
                undefined,
                shape.publishResult
            ),
        listShareLinks: (id: string) =>
            request<RemoteShareLink[]>(
                'GET',
                `/diagrams/${encodeURIComponent(id)}/share-links`,
                undefined,
                undefined,
                z.array(shape.shareLink)
            ),
        createShareLink: (
            id: string,
            body: {
                access?: ShareAccess;
                expiresAt?: string | null;
                live?: boolean;
            } = {}
        ) =>
            request<RemoteShareLinkWithToken>(
                'POST',
                `/diagrams/${encodeURIComponent(id)}/share-links`,
                body,
                undefined,
                shape.shareLinkWithToken
            ),
        updateShareLink: (
            id: string,
            linkId: string,
            body: {
                access?: ShareAccess;
                expiresAt?: string | null;
                live?: boolean;
            }
        ) =>
            request<RemoteShareLink>(
                'PATCH',
                `/diagrams/${encodeURIComponent(id)}/share-links/${encodeURIComponent(linkId)}`,
                body,
                undefined,
                shape.shareLink
            ),
        revokeShareLink: (id: string, linkId: string) =>
            request<void>(
                'DELETE',
                `/diagrams/${encodeURIComponent(id)}/share-links/${encodeURIComponent(linkId)}`
            ),
        regenerateShareLink: (id: string, linkId: string) =>
            request<RemoteShareLinkWithToken>(
                'POST',
                `/diagrams/${encodeURIComponent(id)}/share-links/${encodeURIComponent(linkId)}/regenerate`,
                undefined,
                undefined,
                shape.shareLinkWithToken
            ),
        getPublicShare: async (token: string): Promise<PublicShareResult> => {
            try {
                const res = await fetchImpl(
                    `${baseUrl}/s/${encodeURIComponent(token)}`,
                    {
                        credentials: 'include',
                        // a request that never answers must not leave the page waiting
                        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                    }
                );
                if (res.ok) {
                    const share = shape.publicShare.safeParse(await res.json());
                    return share.success
                        ? { status: 'ok', share: share.data }
                        : { status: 'error' };
                }
                if (res.status === 401) return { status: 'login_required' };
                if (res.status === 404) {
                    const body = (await res.json().catch(() => null)) as {
                        error?: string;
                    } | null;
                    return {
                        status:
                            body?.error === 'not_published'
                                ? 'not_published'
                                : 'not_found',
                    };
                }
                return { status: 'error' };
            } catch {
                return { status: 'error' };
            }
        },
        introspectCatalog: (ref: ConnectionRef) =>
            request<CatalogResponse>(
                'POST',
                '/introspect/catalog',
                ref,
                undefined,
                shape.catalog
            ),
        introspect: (
            ref: ConnectionRef & { schemas?: string[]; tables?: string[] }
        ) =>
            request<{ dialect: DbDialect; metadata: unknown }>(
                'POST',
                '/introspect',
                ref,
                undefined,
                shape.introspectResult
            ),
        listSavedConnections: (projectId: string) =>
            request<SavedConnection[]>(
                'GET',
                `/introspect/connections?projectId=${encodeURIComponent(projectId)}`,
                undefined,
                undefined,
                z.array(shape.savedConnection)
            ),
        saveConnection: (
            input: DbConnectionInput & { name: string; projectId: string }
        ) =>
            request<SavedConnection>(
                'POST',
                '/introspect/connections',
                input,
                undefined,
                shape.savedConnection
            ),
        /** Leave `password` out to keep the one already saved. */
        updateConnection: (
            id: string,
            input: Omit<DbConnectionInput, 'password'> & {
                name: string;
                password?: string;
            }
        ) =>
            request<SavedConnection>(
                'PUT',
                `/introspect/connections/${encodeURIComponent(id)}`,
                input,
                undefined,
                shape.savedConnection
            ),
        /** Whether the server can store connection passwords (CONNECTION_KEY is set). */
        introspectCapabilities: () =>
            request<{ savedConnections: boolean }>(
                'GET',
                '/introspect/capabilities',
                undefined,
                undefined,
                shape.introspectCapabilities
            ),
        deleteSavedConnection: (id: string) =>
            request<void>(
                'DELETE',
                `/introspect/connections/${encodeURIComponent(id)}`
            ),
        getLintConfig: (id: string) =>
            request<LintConfig>(
                'GET',
                `/diagrams/${encodeURIComponent(id)}/lint-config`,
                undefined,
                undefined,
                shape.lintConfig
            ),
        saveLintConfig: (id: string, config: LintConfig) =>
            request<LintConfig>(
                'PUT',
                `/diagrams/${encodeURIComponent(id)}/lint-config`,
                { config },
                undefined,
                shape.lintConfig
            ),
        getDrift: (id: string) =>
            request<DriftOverview>(
                'GET',
                `/diagrams/${encodeURIComponent(id)}/drift`,
                undefined,
                undefined,
                shape.driftOverview
            ),
        saveDrift: (id: string, settings: DriftSettings) =>
            request<DriftSettings>(
                'PUT',
                `/diagrams/${encodeURIComponent(id)}/drift`,
                settings,
                undefined,
                shape.driftSettings
            ),
        /**
         * Reads the database and stores a report. With `cached`, a recent report
         * of an unchanged diagram is handed back instead (opening a diagram).
         */
        checkDrift: (id: string, options?: { cached?: boolean }) =>
            request<DriftCheckResult>(
                'POST',
                `/diagrams/${encodeURIComponent(id)}/drift/check${options?.cached ? '?cached=1' : ''}`,
                undefined,
                undefined,
                shape.driftCheckResult
            ),
        getDriftReport: (id: string, reportId: string) =>
            request<DriftReport>(
                'GET',
                `/diagrams/${encodeURIComponent(id)}/drift/reports/${encodeURIComponent(reportId)}`,
                undefined,
                undefined,
                shape.driftReport
            ),
        dismissDrift: (id: string) =>
            request<{
                latest: DriftReportSummary | null;
                badge: DriftBadge | null;
            }>(
                'POST',
                `/diagrams/${encodeURIComponent(id)}/drift/dismiss`,
                undefined,
                undefined,
                shape.driftDismissResult
            ),
        deleteDiagram: (id: string) =>
            request<void>('DELETE', `/diagrams/${encodeURIComponent(id)}`),

        listMembers: (id: string) =>
            request<RemoteMember[]>(
                'GET',
                `/diagrams/${encodeURIComponent(id)}/members`,
                undefined,
                undefined,
                membersSchema
            ),
    };
}

export type QubdiApi = ReturnType<typeof createApi>;
export const api: QubdiApi = createApi();

export const errorMessage = (e: unknown): string => {
    if (e instanceof ApiError) {
        if (e.code === 'locked') {
            // the server names the editor ("sam@corp.io is editing ..."): take
            // the name and say the rest in the chosen language
            const holder = /^(.+) is editing this diagram\.$/.exec(
                e.detail ?? ''
            )?.[1];
            return holder
                ? i18n.t('qubdi.account.errors.lockedBy', { holder })
                : i18n.t('qubdi.account.errors.locked');
        }
        const key = `qubdi.account.errors.${e.code}`;
        // only server codes (word characters) are looked up; the fallback names the code
        if (/^\w+$/.test(e.code) && i18n.exists(key)) return i18n.t(key);
        return i18n.t('qubdi.account.errors.requestFailed', { code: e.code });
    }
    // the server answered, but its copy of the diagram is not one this editor can read
    if (e instanceof InvalidServerDiagramError) {
        return i18n.t('qubdi.account.errors.invalidDiagram');
    }
    return i18n.t('qubdi.account.errors.unreachable');
};
