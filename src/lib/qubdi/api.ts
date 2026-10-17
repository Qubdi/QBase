import { QUBDI_BACKEND_URL } from './config';
import type { LintConfig } from '../../../shared/lint';
import { listQuery, type ListParams, type Page } from './paging';

export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface RemoteUser {
    id: string;
    email: string;
    isAdmin: boolean;
    /** the password is a temporary one an admin chose: only changing it works until then */
    mustChangePassword: boolean;
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
        /** a saved connection's name, for the connection actions */
        name?: string;
        /** audit.export: how many rows the file held */
        rows?: number;
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

export interface RemoteVersion {
    version: number;
    note: string | null;
    publishedAt: string;
    publishedBy: string | null;
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
}

/** Returned once, on create and regenerate. */
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
    webhookUrl: string | null;
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

export interface RequestOptions {
    /** Let the request finish even if the page is closing (small bodies only). */
    keepalive?: boolean;
}

export function createApi(
    baseUrl: string = QUBDI_BACKEND_URL,
    fetchImpl: FetchLike = (...args) => fetch(...args)
) {
    async function request<T>(
        method: string,
        path: string,
        body?: unknown,
        options?: RequestOptions
    ): Promise<T> {
        const json = body === undefined ? undefined : JSON.stringify(body);
        const res = await fetchImpl(`${baseUrl}${path}`, {
            method,
            credentials: 'include',
            headers:
                body === undefined
                    ? {}
                    : { 'content-type': 'application/json' },
            body: json,
            // one hung request must not stall autosave behind it
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            // an oversized keepalive request would be rejected outright
            ...(options?.keepalive &&
            (json === undefined ? 0 : utf8Bytes(json)) <= KEEPALIVE_BODY_LIMIT
                ? { keepalive: true }
                : {}),
        });
        if (res.status === 204) return undefined as T;
        const data = await res.json().catch(() => ({}));
        // /auth/* answers 401 for ordinary reasons (no session yet, wrong password)
        if (res.status === 401 && !path.startsWith('/auth/')) {
            sessionEndedHandler?.();
        }
        if (!res.ok) {
            throw new ApiError(
                res.status,
                data?.error ?? 'request_failed',
                typeof data?.message === 'string' ? data.message : undefined
            );
        }
        return data as T;
    }

    return {
        setupStatus: () =>
            request<{ needsSetup: boolean; passwordMinLength: number }>(
                'GET',
                '/auth/setup-status'
            ),
        register: (email: string, password: string) =>
            request<RemoteUser>('POST', '/auth/register', { email, password }),
        login: (email: string, password: string) =>
            request<RemoteUser>('POST', '/auth/login', { email, password }),
        logout: () => request<{ ok: true }>('POST', '/auth/logout'),
        me: () => request<RemoteUser>('GET', '/auth/me'),
        changePassword: (currentPassword: string, newPassword: string) =>
            request<{ ok: true }>('POST', '/auth/change-password', {
                currentPassword,
                newPassword,
            }),

        listDiagrams: () => request<RemoteDiagramSummary[]>('GET', '/diagrams'),
        createDiagram: (
            title: string,
            content: Record<string, unknown>,
            projectId: string
        ) =>
            request<RemoteDiagram>('POST', '/diagrams', {
                title,
                content,
                projectId,
            }),
        listProjects: (params?: ListParams) =>
            request<Page<MyProject>>('GET', `/projects${listQuery(params)}`),
        /** One project by its web address or id; 404 unless the user may see it. */
        getProject: (ref: string) =>
            request<MyProject>('GET', `/projects/${encodeURIComponent(ref)}`),

        // admin panel (admins only; everyone else gets a 404)
        adminListUsers: (params?: ListParams & { status?: UserStatus }) =>
            request<Page<AdminUser>>(
                'GET',
                `/admin/users${listQuery(params, { status: params?.status })}`
            ),
        adminCreateUser: (body: {
            email: string;
            password: string;
            isAdmin?: boolean;
        }) => request<AdminUser>('POST', '/admin/users', body),
        adminUpdateUser: (
            id: string,
            body: { password?: string; isAdmin?: boolean; isActive?: boolean }
        ) =>
            request<{ id: string; isAdmin: boolean; isActive: boolean }>(
                'PATCH',
                `/admin/users/${id}`,
                body
            ),
        adminDeleteUser: (id: string) =>
            request<void>('DELETE', `/admin/users/${id}`),
        /** Enable, disable or delete up to 100 accounts; all or nothing. */
        adminBulkUsers: (action: BulkUserAction, ids: string[]) =>
            request<BulkUsersResult>('POST', '/admin/users/bulk', {
                action,
                ids,
            }),
        adminListUserSessions: (id: string) =>
            request<AdminSession[]>('GET', `/admin/users/${id}/sessions`),
        /** Ends every session of the user; says how many were live. */
        adminSignOutUser: (id: string) =>
            request<{ signedOut: number }>(
                'DELETE',
                `/admin/users/${id}/sessions`
            ),
        /** `timeZone` makes a "day" on the chart the viewer's own. */
        adminStats: (timeZone?: string) =>
            request<AdminStats>(
                'GET',
                `/admin/stats${listQuery(undefined, { tz: timeZone })}`
            ),
        adminListDiagrams: (params?: ListParams & { projectId?: string }) =>
            request<Page<AdminDiagram>>(
                'GET',
                `/admin/diagrams${listQuery(params, { projectId: params?.projectId })}`
            ),
        adminListDiagramLinks: (id: string) =>
            request<AdminShareLink[]>(
                'GET',
                `/admin/diagrams/${id}/share-links`
            ),
        /** Ends a share link at once, for anyone using it. */
        adminRevokeDiagramLink: (id: string, linkId: string) =>
            request<void>(
                'DELETE',
                `/admin/diagrams/${id}/share-links/${linkId}`
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
                )}`
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
                `/admin/projects${listQuery(params)}`
            ),
        adminCreateProject: (body: { name: string; description?: string }) =>
            request<AdminProject>('POST', '/admin/projects', body),
        adminUpdateProject: (
            id: string,
            body: { name?: string; description?: string }
        ) => request<AdminProject>('PATCH', `/admin/projects/${id}`, body),
        adminDeleteProject: (id: string) =>
            request<void>('DELETE', `/admin/projects/${id}`),
        adminListProjectMembers: (id: string) =>
            request<ProjectMember[]>('GET', `/admin/projects/${id}/members`),
        adminSetProjectMember: (
            id: string,
            userId: string,
            role: ProjectRole
        ) =>
            request<ProjectMember>(
                'PUT',
                `/admin/projects/${id}/members/${userId}`,
                { role }
            ),
        adminRemoveProjectMember: (id: string, userId: string) =>
            request<void>('DELETE', `/admin/projects/${id}/members/${userId}`),
        getDiagram: (id: string) =>
            request<RemoteDiagram>('GET', `/diagrams/${id}`),
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
        ) => request<RemoteDiagram>('PUT', `/diagrams/${id}`, patch, options),
        /** Only one editor at a time: `held: false` means someone else has it. */
        acquireLock: (id: string, editorId: string) =>
            request<{ held: true } | { held: false; holder: string }>(
                'POST',
                `/diagrams/${id}/lock`,
                { editorId }
            ),
        releaseLock: (id: string, editorId: string, options?: RequestOptions) =>
            request<void>(
                'DELETE',
                `/diagrams/${id}/lock?editorId=${encodeURIComponent(editorId)}`,
                undefined,
                options
            ),
        publish: (id: string, note?: string) =>
            request<{
                version: number;
                note: string | null;
                publishedAt: string;
            }>('POST', `/diagrams/${id}/publish`, note ? { note } : {}),
        listShareLinks: (id: string) =>
            request<RemoteShareLink[]>('GET', `/diagrams/${id}/share-links`),
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
                `/diagrams/${id}/share-links`,
                body
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
                `/diagrams/${id}/share-links/${linkId}`,
                body
            ),
        revokeShareLink: (id: string, linkId: string) =>
            request<void>('DELETE', `/diagrams/${id}/share-links/${linkId}`),
        regenerateShareLink: (id: string, linkId: string) =>
            request<RemoteShareLinkWithToken>(
                'POST',
                `/diagrams/${id}/share-links/${linkId}/regenerate`
            ),
        getPublicShare: async (token: string): Promise<PublicShareResult> => {
            try {
                const res = await fetchImpl(
                    `${baseUrl}/s/${encodeURIComponent(token)}`,
                    { credentials: 'include' }
                );
                if (res.ok) {
                    return { status: 'ok', share: await res.json() };
                }
                if (res.status === 401) return { status: 'login_required' };
                if (res.status === 404) return { status: 'not_found' };
                return { status: 'error' };
            } catch {
                return { status: 'error' };
            }
        },
        introspectCatalog: (ref: ConnectionRef) =>
            request<CatalogResponse>('POST', '/introspect/catalog', ref),
        introspect: (
            ref: ConnectionRef & { schemas?: string[]; tables?: string[] }
        ) =>
            request<{ dialect: DbDialect; metadata: unknown }>(
                'POST',
                '/introspect',
                ref
            ),
        listSavedConnections: (projectId: string) =>
            request<SavedConnection[]>(
                'GET',
                `/introspect/connections?projectId=${encodeURIComponent(projectId)}`
            ),
        saveConnection: (
            input: DbConnectionInput & { name: string; projectId: string }
        ) => request<SavedConnection>('POST', '/introspect/connections', input),
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
                `/introspect/connections/${id}`,
                input
            ),
        /** Whether the server can store connection passwords (CONNECTION_KEY is set). */
        introspectCapabilities: () =>
            request<{ savedConnections: boolean }>(
                'GET',
                '/introspect/capabilities'
            ),
        deleteSavedConnection: (id: string) =>
            request<void>('DELETE', `/introspect/connections/${id}`),
        getLintConfig: (id: string) =>
            request<LintConfig>('GET', `/diagrams/${id}/lint-config`),
        saveLintConfig: (id: string, config: LintConfig) =>
            request<LintConfig>('PUT', `/diagrams/${id}/lint-config`, {
                config,
            }),
        getDrift: (id: string) =>
            request<DriftOverview>('GET', `/diagrams/${id}/drift`),
        saveDrift: (id: string, settings: DriftSettings) =>
            request<DriftSettings>('PUT', `/diagrams/${id}/drift`, settings),
        /**
         * Reads the database and stores a report. With `cached`, a recent report
         * of an unchanged diagram is handed back instead (opening a diagram).
         */
        checkDrift: (id: string, options?: { cached?: boolean }) =>
            request<DriftCheckResult>(
                'POST',
                `/diagrams/${id}/drift/check${options?.cached ? '?cached=1' : ''}`
            ),
        getDriftReport: (id: string, reportId: string) =>
            request<DriftReport>(
                'GET',
                `/diagrams/${id}/drift/reports/${reportId}`
            ),
        dismissDrift: (id: string) =>
            request<{
                latest: DriftReportSummary | null;
                badge: DriftBadge | null;
            }>('POST', `/diagrams/${id}/drift/dismiss`),
        deleteDiagram: (id: string) =>
            request<void>('DELETE', `/diagrams/${id}`),

        listMembers: (id: string) =>
            request<RemoteMember[]>('GET', `/diagrams/${id}/members`),
    };
}

export type QubdiApi = ReturnType<typeof createApi>;
export const api: QubdiApi = createApi();

export const errorMessage = (e: unknown): string => {
    if (e instanceof ApiError) {
        const map: Record<string, string> = {
            invalid_credentials: 'Wrong email or password.',
            email_taken: 'That email is already registered.',
            signup_disabled:
                'Accounts are created by an admin. Ask yours for access.',
            invalid_request: 'Please check the values you entered.',
            wrong_password: 'Current password is incorrect.',
            weak_password: 'That password does not meet the rules below.',
            same_password: 'Choose a password different from the current one.',
            password_change_required:
                'Choose your own password before you continue.',
            user_not_found: 'No account with that email exists yet.',
            already_member: 'That person already has access.',
            forbidden: 'You do not have permission to do that.',
            not_found: 'Not found.',
            encryption_not_configured:
                'This server cannot store passwords (CONNECTION_KEY is not set).',
            name_taken: 'That name is already in use.',
            password_required:
                'Type the password again to change the host, port or type of a saved connection.',
            too_many_attempts:
                'Too many failed attempts. Wait a few minutes and try again.',
            invalid_webhook: 'That webhook URL is not valid.',
            connection_required: 'Choose a saved connection first.',
            connection_not_found: 'That saved connection does not exist.',
            not_configured: 'Save the drift settings first.',
            already_running: 'A check is already running.',
            no_project:
                'Open this diagram from a project before saving it to the server.',
            last_admin: 'There must be at least one admin who can sign in.',
            cannot_disable_self: 'You cannot disable your own account.',
            cannot_sign_out_self:
                'You cannot sign yourself out here. Use Sign out in the account menu.',
            account_disabled:
                'This account has been disabled. Ask an admin to enable it.',
            invalid_name:
                'Use letters or numbers in the project name; it becomes its web address.',
            reserved_name:
                'That name is used by the app itself. Choose another one.',
            cannot_delete_self: 'You cannot delete your own account.',
            project_not_empty:
                'This project still has diagrams. Delete them first.',
            managed_by_project:
                'Access is managed by the project. Ask an admin to change it.',
        };
        if (e.code === 'target_blocked' || e.code === 'connection_failed') {
            return e.detail ?? `Request failed (${e.code}).`;
        }
        if (e.code === 'locked') {
            return e.detail ?? 'Someone else is editing this diagram.';
        }
        return map[e.code] ?? `Request failed (${e.code}).`;
    }
    return 'Could not reach the server.';
};
