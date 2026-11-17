import { z } from 'zod';

/**
 * Runtime checks for what the server answers (CLI-006). They are written
 * against the server's own presenters (`server/src/**`), and match what the
 * client reads:
 *
 * - every object is loose, so a field the server adds later is kept;
 * - a field the client reads is required, with the type the server sends;
 * - a field the server leaves out for some callers (a viewer, an old row) is
 *   optional or nullable, as it is there.
 *
 * An answer that does not match fails the call as `invalid_response`.
 */

const id = z.string();
const time = z.string();
const nullableTime = z.string().nullable();

export const memberRole = z.enum(['owner', 'editor', 'viewer']);
export const projectRole = z.enum(['editor', 'viewer']);
export const shareAccess = z.enum(['anyone', 'signed_in', 'off']);
export const dbDialect = z.enum(['postgresql', 'sqlserver']);
const severity = z.enum(['breaking', 'warning', 'info']);
const counts = z.looseObject({
    breaking: z.number(),
    warning: z.number(),
    info: z.number(),
});

export const page = <T extends z.ZodType>(item: T) =>
    z.looseObject({
        items: z.array(item),
        total: z.number(),
        page: z.number(),
        limit: z.number(),
    });

// ---- projects and the admin panel ----------------------------------------

export const myProject = z.looseObject({
    id,
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    diagramCount: z.number(),
    role: memberRole,
});

export const adminUser = z.looseObject({
    id,
    email: z.string(),
    isAdmin: z.boolean(),
    isActive: z.boolean(),
    createdAt: time,
    lastLoginAt: nullableTime,
    lastActiveAt: nullableTime,
    projects: z.number(),
    mfaEnabled: z.boolean().optional(),
});
export const adminUserChange = z.looseObject({
    id,
    isAdmin: z.boolean(),
    isActive: z.boolean(),
});
export const bulkUsersResult = z.looseObject({
    changed: z.number(),
    unchanged: z.number(),
});
export const adminSession = z.looseObject({
    createdAt: time,
    lastSeenAt: time,
    expiresAt: time,
    userAgent: z.string().nullable(),
});
export const signedOutCount = z.looseObject({ signedOut: z.number() });
export const resetResult = z.looseObject({ reset: z.boolean() });

/** A project row; an update answers with this, without the counts. */
export const adminProjectRow = z.looseObject({
    id,
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    createdAt: time,
});
export const adminProject = z.looseObject({
    ...adminProjectRow.shape,
    members: z.number(),
    diagrams: z.number(),
});
export const projectMember = z.looseObject({
    userId: id,
    email: z.string(),
    role: projectRole,
});

export const adminStats = z.looseObject({
    users: z.looseObject({
        total: z.number(),
        active: z.number(),
        admins: z.number(),
        signedIn: z.number(),
    }),
    projects: z.number(),
    diagrams: z.looseObject({ total: z.number(), published: z.number() }),
    activeLinks: z.number(),
    editingNow: z.number(),
    driftChecks24h: z.number(),
    activity: z.looseObject({
        timeZone: z.string(),
        days: z.array(z.looseObject({ day: z.string(), events: z.number() })),
    }),
});

export const adminDiagram = z.looseObject({
    id,
    title: z.string(),
    projectId: id,
    projectName: z.string().nullable(),
    projectSlug: z.string().nullable(),
    ownerId: id,
    ownerEmail: z.string().nullable(),
    updatedAt: time,
    publishedVersion: z.number().nullable(),
    editingBy: z
        .looseObject({ userId: id, email: z.string().nullable() })
        .nullable(),
    activeLinks: z.number(),
});
export const adminShareLink = z.looseObject({
    id,
    access: shareAccess,
    live: z.boolean(),
    expiresAt: nullableTime,
    createdAt: time,
    revokedAt: nullableTime,
    createdById: z.string().nullable(),
    createdByEmail: z.string().nullable(),
    status: z.enum(['active', 'off', 'expired', 'revoked']),
});
export const activityPage = z.looseObject({
    items: z.array(
        z.looseObject({
            id: z.number(),
            at: time,
            action: z.string(),
            userId: z.string().nullable(),
            userEmail: z.string().nullable(),
            diagramId: z.string().nullable(),
            diagramTitle: z.string().nullable(),
            projectId: z.string().nullable(),
            projectName: z.string().nullable(),
            targetUserId: z.string().nullable(),
            targetUserEmail: z.string().nullable(),
            meta: z.record(z.string(), z.unknown()).nullable(),
        })
    ),
    nextCursor: z.string().nullable(),
});

// ---- diagrams -------------------------------------------------------------

export const diagramSummary = z.looseObject({
    id,
    title: z.string(),
    // a viewer's row is dated by the published copy
    updatedAt: time,
    ownerId: id,
    projectId: z.string().nullish(),
    role: memberRole,
    ownerEmail: z.string().nullish(),
    databaseType: z.string().nullish(),
    databaseEdition: z.string().nullish(),
    tableCount: z.number().optional(),
    relationshipCount: z.number().optional(),
    createdAt: z.string().nullish(),
});
export const diagramList = z.array(diagramSummary);

const publishStatus = {
    publishedVersion: z.number().nullable(),
    publishedAt: nullableTime,
    unpublishedChanges: z.boolean().optional(),
    autoPublish: z.boolean().optional(),
};
/** A whole diagram: what open and create answer. */
export const remoteDiagram = z.looseObject({
    ...diagramSummary.shape,
    content: z.record(z.string(), z.unknown()).nullable(),
    ...publishStatus,
});
/** What a save answers: the content is not sent back. */
export const savedDiagram = z.looseObject({
    id,
    ownerId: id,
    title: z.string(),
    updatedAt: time,
    role: memberRole,
    ...publishStatus,
});
export const publishStatusOnly = z.looseObject(publishStatus);
export const lockAnswer = z.union([
    z.looseObject({ held: z.literal(true) }),
    z.looseObject({ held: z.literal(false), holder: z.string() }),
]);
/** The answer to asking the diagram's editor to step out (a "poke"). */
export const pokeAnswer = z.union([
    // nobody was editing after all: the lock is set aside for this user
    z.looseObject({ status: z.literal('granted') }),
    z.looseObject({
        status: z.literal('sent'),
        pokeId: id,
        /** how long the request waits for an answer, in seconds */
        waitSeconds: z.number(),
        /** who was asked, by email */
        holder: z.string(),
    }),
]);
/** What the lock stream says to the editor that was asked to step out. */
export const pokeEvent = z.looseObject({
    pokeId: id,
    /** who asks, by email */
    from: z.string(),
    /** how long is left to answer, in seconds */
    waitSeconds: z.number(),
});
/** What the lock stream says to the editor that asked: how the request ended. */
export const pokeResultEvent = z.looseObject({
    pokeId: id,
    outcome: z.enum(['accepted', 'declined', 'left']),
});
export const publishResult = z.looseObject({
    version: z.number(),
    note: z.string().nullable(),
    publishedAt: time,
});

export const shareLink = z.looseObject({
    id,
    diagramId: id,
    access: shareAccess,
    expiresAt: nullableTime,
    live: z.boolean(),
    createdAt: time,
    revokedAt: nullableTime,
    token: z.string().optional(),
});
export const shareLinkWithToken = z.looseObject({
    ...shareLink.shape,
    token: z.string(),
});
export const publicShare = z.looseObject({
    title: z.string(),
    content: z.record(z.string(), z.unknown()),
    version: z.number(),
    publishedAt: time,
    live: z.boolean(),
});

// ---- database import and drift --------------------------------------------

export const savedConnection = z.looseObject({
    id,
    name: z.string(),
    dialect: dbDialect,
    host: z.string(),
    port: z.number(),
    database: z.string(),
    user: z.string(),
    ssl: z.boolean(),
    trustServerCertificate: z.boolean(),
    createdAt: time,
});
export const catalog = z.looseObject({
    dialect: dbDialect,
    database: z.string(),
    schemas: z.array(
        z.looseObject({
            schema: z.string(),
            tables: z.array(z.string()),
            views: z.array(z.string()),
        })
    ),
});
export const introspectResult = z.looseObject({
    dialect: dbDialect,
    metadata: z.unknown(),
});
export const introspectCapabilities = z.looseObject({
    savedConnections: z.boolean(),
});

const driftStatus = z.enum(['clean', 'drifted', 'error']);
const driftBadge = z.looseObject({
    status: z.enum(['drifted', 'error']),
    counts,
    reportId: id,
});
const driftReportSummary = z.looseObject({
    id,
    runAt: time,
    status: driftStatus,
    trigger: z.enum(['manual', 'schedule']),
    counts,
    worst: severity.nullable(),
    error: z.string().nullable(),
    dismissedAt: nullableTime,
    webhook: z.string().nullable(),
});
export const driftReport = z.looseObject({
    ...driftReportSummary.shape,
    changes: z.array(
        z.looseObject({
            id,
            kind: z.string(),
            category: z.enum([
                'only_in_database',
                'only_in_diagram',
                'differs',
            ]),
            severity,
            summary: z.string(),
        })
    ),
    renameHints: z.array(z.string()),
});
export const driftCheckResult = z.looseObject({
    ...driftReport.shape,
    badge: driftBadge.nullable(),
});
export const driftSettings = z.looseObject({
    connectionId: z.string().nullable(),
    schemas: z.array(z.string()),
    tables: z.array(z.string()),
    sourceKeys: z.looseObject({
        tables: z.record(z.string(), z.string()),
        columns: z.record(z.string(), z.string()),
    }),
    webhookHost: z.string().nullish(),
});
export const driftOverview = z.looseObject({
    settings: driftSettings.nullable(),
    latest: driftReportSummary.nullable(),
    badge: driftBadge.nullable(),
});
export const driftDismissResult = z.looseObject({
    latest: driftReportSummary.nullable(),
    badge: driftBadge.nullable(),
});

// ---- lint -----------------------------------------------------------------

const lintSeverity = z.enum(['error', 'warning', 'info']);
export const lintConfig = z.looseObject({
    rules: z
        .record(
            z.string(),
            z.looseObject({
                enabled: z.boolean().optional(),
                severity: lintSeverity.optional(),
            })
        )
        .optional(),
    naming: z
        .looseObject({
            style: z.enum(['auto', 'snake_case', 'camelCase']).optional(),
            tables: z
                .enum(['consistent', 'plural', 'singular', 'any'])
                .optional(),
        })
        .optional(),
});

// ---- two-factor and acknowledgements --------------------------------------

export const mfaSetup = z.looseObject({
    secret: z.string(),
    otpauthUrl: z.string(),
});
export const recoveryCodes = z.looseObject({
    recoveryCodes: z.array(z.string()),
});
export const okAnswer = z.looseObject({ ok: z.literal(true) });
