import { QUBDI_BACKEND_URL } from './config';
import type { EditorComment } from './comments-store';
import type { LintConfig } from '../../../shared/lint';
import { listQuery, type ListParams, type Page } from './paging';

export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface RemoteUser {
    id: string;
    email: string;
    isAdmin: boolean;
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
    /** number of projects the user is assigned to */
    projects: number;
}

export type UserStatus = 'active' | 'disabled';

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

/** A comment as read-only viewers see it: no author, no orphaned ones. */
export interface PublicComment {
    id: string;
    targetType: 'table' | 'field' | 'relationship';
    targetId: string;
    body: string;
    resolved: boolean;
    createdAt: string;
}

export type PublicCommentsResult =
    | { status: 'ok'; version: number; comments: PublicComment[] }
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

export interface DriftSettings {
    enabled: boolean;
    schedule: string;
    connectionId: string | null;
    schemas: string[];
    tables: string[];
    sourceKeys: {
        tables: Record<string, string>;
        columns: Record<string, string>;
    };
    webhookUrl: string | null;
    nextRunAt: string | null;
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

export function createApi(
    baseUrl: string = QUBDI_BACKEND_URL,
    fetchImpl: FetchLike = (...args) => fetch(...args)
) {
    async function request<T>(
        method: string,
        path: string,
        body?: unknown
    ): Promise<T> {
        const res = await fetchImpl(`${baseUrl}${path}`, {
            method,
            credentials: 'include',
            headers:
                body === undefined
                    ? {}
                    : { 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (res.status === 204) return undefined as T;
        const data = await res.json().catch(() => ({}));
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
            request<{ needsSetup: boolean }>('GET', '/auth/setup-status'),
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
            }
        ) => request<RemoteDiagram>('PUT', `/diagrams/${id}`, patch),
        publish: (id: string, note?: string) =>
            request<{
                version: number;
                note: string | null;
                publishedAt: string;
            }>('POST', `/diagrams/${id}/publish`, note ? { note } : {}),
        listVersions: (id: string) =>
            request<RemoteVersion[]>('GET', `/diagrams/${id}/versions`),
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
        listComments: (id: string) =>
            request<EditorComment[]>('GET', `/diagrams/${id}/comments`),
        addComment: (
            id: string,
            body: {
                targetType: 'table' | 'field' | 'relationship';
                targetId: string;
                body: string;
            }
        ) => request<EditorComment>('POST', `/diagrams/${id}/comments`, body),
        updateComment: (id: string, commentId: string, body: string) =>
            request<EditorComment>(
                'PUT',
                `/diagrams/${id}/comments/${commentId}`,
                { body }
            ),
        resolveComment: (id: string, commentId: string, resolved: boolean) =>
            request<EditorComment>(
                'POST',
                `/diagrams/${id}/comments/${commentId}/resolve`,
                { resolved }
            ),
        deleteComment: (id: string, commentId: string) =>
            request<void>('DELETE', `/diagrams/${id}/comments/${commentId}`),
        getPublicComments: async (
            token: string
        ): Promise<PublicCommentsResult> => {
            try {
                const res = await fetchImpl(
                    `${baseUrl}/s/${encodeURIComponent(token)}/comments`,
                    { credentials: 'include' }
                );
                if (res.ok) {
                    const data = await res.json();
                    return {
                        status: 'ok',
                        version: data.version,
                        comments: data.comments,
                    };
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
        saveDrift: (id: string, settings: Omit<DriftSettings, 'nextRunAt'>) =>
            request<DriftSettings>('PUT', `/diagrams/${id}/drift`, settings),
        checkDrift: (id: string) =>
            request<DriftReport>('POST', `/diagrams/${id}/drift/check`),
        listDriftReports: (id: string, limit = 20) =>
            request<DriftReportSummary[]>(
                'GET',
                `/diagrams/${id}/drift/reports?limit=${limit}`
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
        addMember: (id: string, email: string, role: 'editor' | 'viewer') =>
            request<RemoteMember>('POST', `/diagrams/${id}/members`, {
                email,
                role,
            }),
        changeMemberRole: (
            id: string,
            userId: string,
            role: 'editor' | 'viewer'
        ) =>
            request<{ userId: string; role: MemberRole }>(
                'PATCH',
                `/diagrams/${id}/members/${userId}`,
                { role }
            ),
        removeMember: (id: string, userId: string) =>
            request<void>('DELETE', `/diagrams/${id}/members/${userId}`),
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
            user_not_found: 'No account with that email exists yet.',
            already_member: 'That person already has access.',
            forbidden: 'You do not have permission to do that.',
            not_found: 'Not found.',
            encryption_not_configured:
                'This server cannot store passwords (CONNECTION_KEY is not set).',
            name_taken: 'That name is already in use.',
            invalid_schedule: 'That schedule is not a valid cron expression.',
            invalid_webhook: 'That webhook URL is not valid.',
            connection_required: 'Choose a saved connection to enable checks.',
            connection_not_found: 'That saved connection does not exist.',
            not_configured: 'Save the drift settings first.',
            already_running: 'A check is already running.',
            no_project:
                'Open this diagram from a project before saving it to the server.',
            last_admin: 'There must be at least one admin who can sign in.',
            cannot_disable_self: 'You cannot disable your own account.',
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
        return map[e.code] ?? `Request failed (${e.code}).`;
    }
    return 'Could not reach the server.';
};
