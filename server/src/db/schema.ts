import { sql } from 'drizzle-orm';
import {
    index,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    serial,
    text,
    timestamp,
    uuid,
    boolean,
    integer,
    uniqueIndex,
} from 'drizzle-orm/pg-core';

export const projectRole = pgEnum('project_role', ['editor', 'viewer']);

export const shareAccess = pgEnum('share_access', [
    'anyone',
    'signed_in',
    'off',
]);

export const commentTarget = pgEnum('comment_target', [
    'table',
    'field',
    'relationship',
]);

export const driftStatus = pgEnum('drift_status', [
    'clean',
    'drifted',
    'error',
]);

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    // a disabled user cannot sign in; their data and assignments stay
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
});

export const sessions = pgTable('sessions', {
    // sha256 of the cookie token; the raw token is never stored
    id: text('id').primaryKey(),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const projects = pgTable(
    'projects',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: text('name').notNull().unique(),
        slug: text('slug').notNull(),
        description: text('description').notNull().default(''),
        createdBy: uuid('created_by').references(() => users.id, {
            onDelete: 'set null',
        }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        // the URL piece (/Qubdi/diagrams); unique ignoring case
        uniqueIndex('projects_slug_lower_idx').on(sql`lower(${t.slug})`),
    ]
);

export const projectMembers = pgTable(
    'project_members',
    {
        projectId: uuid('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        role: projectRole('role').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.projectId, t.userId] }),
        index('project_members_user_idx').on(t.userId),
    ]
);

export const diagrams = pgTable('diagrams', {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    // every diagram lives in exactly one project; access comes from the project
    projectId: uuid('project_id')
        .notNull()
        .references(() => projects.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    content: jsonb('content').notNull(),
    autoPublish: boolean('auto_publish').notNull().default(false),
    // per-diagram lint rule settings (enabled rules, severities, naming style)
    lintConfig: jsonb('lint_config').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
});

export const snapshots = pgTable(
    'snapshots',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        diagramId: uuid('diagram_id')
            .notNull()
            .references(() => diagrams.id, { onDelete: 'cascade' }),
        version: integer('version').notNull(),
        title: text('title').notNull(),
        content: jsonb('content').notNull(),
        contentHash: text('content_hash').notNull(),
        publishedBy: uuid('published_by').references(() => users.id, {
            onDelete: 'set null',
        }),
        publishedAt: timestamp('published_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        note: text('note'),
    },
    (t) => [
        uniqueIndex('snapshots_diagram_version_idx').on(t.diagramId, t.version),
    ]
);

export const auditLog = pgTable('audit_log', {
    id: serial('id').primaryKey(),
    // no FKs: audit rows must outlive deleted users and diagrams
    userId: uuid('user_id'),
    action: text('action').notNull(),
    diagramId: uuid('diagram_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const shareLinks = pgTable('share_links', {
    id: uuid('id').primaryKey().defaultRandom(),
    diagramId: uuid('diagram_id')
        .notNull()
        .references(() => diagrams.id, { onDelete: 'cascade' }),
    // sha256 of the URL token; the raw token is shown once and never stored
    tokenHash: text('token_hash').notNull().unique(),
    access: shareAccess('access').notNull().default('anyone'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    live: boolean('live').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, {
        onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const comments = pgTable(
    'comments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        diagramId: uuid('diagram_id')
            .notNull()
            .references(() => diagrams.id, { onDelete: 'cascade' }),
        // latest published version this comment has been carried to (0 = none yet)
        snapshotVersion: integer('snapshot_version').notNull().default(0),
        targetType: commentTarget('target_type').notNull(),
        targetId: text('target_id').notNull(),
        body: text('body').notNull(),
        authorId: uuid('author_id').references(() => users.id, {
            onDelete: 'set null',
        }),
        resolved: boolean('resolved').notNull().default(false),
        // true when the target no longer exists in the latest published version
        orphaned: boolean('orphaned').notNull().default(false),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => [index('comments_diagram_idx').on(t.diagramId)]
);

export const savedConnections = pgTable(
    'saved_connections',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        // connections belong to a project and are usable by its editors
        projectId: uuid('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade' }),
        // who saved it; the connection outlives that user
        ownerId: uuid('owner_id').references(() => users.id, {
            onDelete: 'set null',
        }),
        name: text('name').notNull(),
        dialect: text('dialect').notNull(),
        host: text('host').notNull(),
        port: integer('port').notNull(),
        database: text('database').notNull(),
        username: text('username').notNull(),
        // AES-256-GCM, key from CONNECTION_KEY; never returned by the API
        passwordEnc: text('password_enc').notNull(),
        ssl: boolean('ssl').notNull().default(false),
        trustServerCertificate: boolean('trust_server_certificate')
            .notNull()
            .default(false),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        uniqueIndex('saved_connections_project_name_idx').on(
            t.projectId,
            t.name
        ),
    ]
);

export const driftSettings = pgTable('drift_settings', {
    diagramId: uuid('diagram_id')
        .primaryKey()
        .references(() => diagrams.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    // 5-field cron expression, UTC
    schedule: text('schedule').notNull().default('0 3 * * *'),
    connectionId: uuid('connection_id').references(() => savedConnections.id, {
        onDelete: 'set null',
    }),
    schemas: jsonb('schemas').notNull().default([]),
    tables: jsonb('tables').notNull().default([]),
    // stored source identity sent by the editor, so renames do not look like drift
    sourceKeys: jsonb('source_keys')
        .notNull()
        .default({ tables: {}, columns: {} }),
    webhookUrl: text('webhook_url'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    updatedBy: uuid('updated_by').references(() => users.id, {
        onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
});

export const driftReports = pgTable(
    'drift_reports',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        diagramId: uuid('diagram_id')
            .notNull()
            .references(() => diagrams.id, { onDelete: 'cascade' }),
        runAt: timestamp('run_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        status: driftStatus('status').notNull(),
        trigger: text('trigger').notNull(),
        changes: jsonb('changes').notNull().default([]),
        renameHints: jsonb('rename_hints').notNull().default([]),
        counts: jsonb('counts')
            .notNull()
            .default({ breaking: 0, warning: 0, info: 0 }),
        error: text('error'),
        signature: text('signature').notNull().default(''),
        dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
        webhook: text('webhook'),
    },
    (t) => [index('drift_reports_diagram_idx').on(t.diagramId, t.runAt)]
);
