import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    index,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uuid,
    boolean,
    integer,
    smallint,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AuditMeta } from '../audit/audit.js';

export const projectRole = pgEnum('project_role', ['editor', 'viewer']);

export const shareAccess = pgEnum('share_access', [
    'anyone',
    'signed_in',
    'off',
]);

export const driftStatus = pgEnum('drift_status', [
    'clean',
    'drifted',
    'error',
]);

// how a drift report came about; 'schedule' stays for reports stored back
// when checks still ran on a timer
export const driftTrigger = pgEnum('drift_trigger', ['manual', 'schedule']);

export const users = pgTable(
    'users',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        // the plain unique constraint serves the sign-in lookup (email = $1)
        email: text('email').notNull().unique(),
        // null for a person QAuth knows (AUTH_PROVIDER=qauth): the password is QAuth's
        passwordHash: text('password_hash'),
        // QAuth's id for the person (its `sub`), what QBase's own roles hang on; null for a local account
        qauthSub: text('qauth_sub').unique(),
        isAdmin: boolean('is_admin').notNull().default(false),
        // a disabled user cannot sign in; their data and assignments stay
        isActive: boolean('is_active').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        // set at every sign-in; null until the person signs in after this
        // column was added (and for an account nobody has signed in to yet)
        lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
        // true while the password is a temporary one an admin chose (a new
        // account, or a reset): the API refuses everything but changing it,
        // signing out and `me` until the person sets their own
        mustChangePassword: boolean('must_change_password')
            .notNull()
            .default(false),
        // authenticator-app secret, AES-256-GCM (never plain, never returned
        // after setup). Set while setting up; null = no authenticator
        mfaSecretEnc: text('mfa_secret_enc'),
        // when two-factor was switched on; null = off, or still being set up
        mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
        // the last 30-second step whose code was accepted, so a code cannot be
        // used twice
        mfaLastStep: bigint('mfa_last_step', { mode: 'number' }),
    },
    (t) => [
        // the app lowercases emails; this makes the database refuse a second
        // account that differs only by case
        uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
        // two-factor cannot be on without a secret to check codes against
        check(
            'users_mfa_secret_when_enabled',
            sql`${t.mfaEnabledAt} is null or ${t.mfaSecretEnc} is not null`
        ),
    ]
);

// One-time codes for a lost phone. Only a hash is kept (sha256 is enough for
// long random codes); a code is spent by setting used_at.
export const mfaRecoveryCodes = pgTable(
    'mfa_recovery_codes',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        // deleted with the user; the unique index below leads with user_id, so
        // it also serves the cascade and "codes left for this user"
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        codeHash: text('code_hash').notNull(),
        usedAt: timestamp('used_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => [uniqueIndex('mfa_recovery_codes_user_hash_idx').on(t.userId, t.codeHash)]
);

// The pending second step of a sign-in: the password was right, the code is
// still to come. Stateful on purpose: one-time use and an attempt counter.
// Purged by the hourly maintenance once expired.
export const mfaChallenges = pgTable(
    'mfa_challenges',
    {
        // sha256 of the ticket given to the browser; the ticket is never stored
        id: text('id').primaryKey(),
        // deleted with the user
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        // wrong codes so far; the challenge dies after a few
        attempts: smallint('attempts').notNull().default(0),
    },
    (t) => [
        // one pending sign-in per account, enforced here: a second login that
        // races the first replaces it instead of leaving two; also the cascade
        uniqueIndex('mfa_challenges_user_idx').on(t.userId),
        // the hourly purge of expired rows
        index('mfa_challenges_expires_idx').on(t.expiresAt),
        check('mfa_challenges_attempts_nonneg', sql`${t.attempts} >= 0`),
    ]
);

export const sessions = pgTable(
    'sessions',
    {
        // sha256 of the cookie token; the raw token is never stored
        id: text('id').primaryKey(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        // when the person signed in (a session that existed before this column
        // shows the day it was added)
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        // last request made with this session, written at most every 5 minutes
        // (see getSessionUser), not on every request
        lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        // the browser's User-Agent, cut to 200 characters, so an admin can tell
        // sessions apart; no IP address is kept, it is personal data we do not need
        userAgent: text('user_agent'),
        // QAuth mode: QAuth's refresh token for this sign-in (encrypted), used to ask
        // QAuth whether the person is still signed in there; null for a local session
        idpRefreshEnc: text('idp_refresh_enc'),
        // when QAuth was last asked (at sign-in, then at most every few minutes)
        idpCheckedAt: timestamp('idp_checked_at', { withTimezone: true }),
    },
    (t) => [
        // sign-in, sign-out and "reset password" delete a user's sessions by
        // user_id, and so does the cascade when the user is deleted.
        // No expires_at index: a user has one live session, so the table holds
        // about one row per user and the hourly purge reads all of it anyway.
        // No index on last_seen_at either, so writing it stays an in-place update.
        index('sessions_user_idx').on(t.userId),
        check('sessions_user_agent_len', sql`char_length(${t.userAgent}) <= 200`),
    ]
);

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
        // deleting a user sets created_by to null: without this it scans the table
        index('projects_created_by_idx').on(t.createdBy),
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

export const diagrams = pgTable(
    'diagrams',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        // on delete cascade, but the admin delete route first hands the user's
        // diagrams to the admin, so a user's diagrams are never lost
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // every diagram lives in exactly one project; access comes from the project
        projectId: uuid('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'restrict' }),
        title: text('title').notNull(),
        content: jsonb('content').notNull(),
        // `diagramHash(title, content)`, kept up to date by every save so that
        // reading a diagram never has to hash its (large) content. Null for a
        // row not yet hashed; the next read fills it in.
        contentHash: text('content_hash'),
        // What the diagram list shows about each diagram, worked out by the app
        // as the content is written (`diagramStats`) and stored as plain columns,
        // so listing never reads the content and a save never makes the database
        // parse it again. A row written before these were plain keeps the values
        // its old generated columns had.
        statDatabaseType: text('stat_database_type'),
        statDatabaseEdition: text('stat_database_edition'),
        statTableCount: integer('stat_table_count').notNull().default(0),
        statRelationshipCount: integer('stat_relationship_count')
            .notNull()
            .default(0),
        statCreatedAt: text('stat_created_at'),
        // size in bytes of the content as compact JSON, written with the stats; the
        // size checks read this instead of turning the content into text. Null
        // until the start-up fill reaches the row: readers then measure it.
        statContentBytes: integer('stat_content_bytes'),
        autoPublish: boolean('auto_publish').notNull().default(false),
        // per-diagram lint rule settings (enabled rules, severities, naming style)
        lintConfig: jsonb('lint_config').notNull().default({}),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        // a project's diagrams: the workspace list, the admin project counts
        // and the "project is not empty" check; also the scan that the restrict
        // rule on project_id makes when a project is deleted. It is only
        // project_id on purpose: updated_at changes on every save, and an
        // index that contains it turns every autosave from a cheap in-place
        // (HOT) update into one that writes index entries (0 of 3,000 saves
        // were HOT with it, all 3,000 without)
        index('diagrams_project_idx').on(t.projectId),
        // the admin user delete reassigns a user's diagrams by owner_id, and the
        // cascade scans it too
        index('diagrams_owner_idx').on(t.ownerId),
    ]
);

/**
 * Who is editing a diagram right now: at most one editor at a time. The editor
 * renews its lock while the diagram is open; a lock nobody renews runs out.
 */
export const diagramLocks = pgTable('diagram_locks', {
    diagramId: uuid('diagram_id')
        .primaryKey()
        .references(() => diagrams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    // one browser tab: the same user in a second tab is a second editor
    editorId: text('editor_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
},
(t) => [
    // sign-in and sign-out delete a user's locks, and deleting a user cascades here
    index('diagram_locks_user_idx').on(t.userId),
]);

/**
 * A request to whoever holds a diagram's edit lock to step out (a "poke"),
 * sent by another editor who found the diagram locked. At most one poke waits
 * for an answer per diagram. The rows also remember when each person last
 * poked, which is what the wait between pokes is counted from.
 */
export const lockPokes = pgTable(
    'lock_pokes',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        diagramId: uuid('diagram_id')
            .notNull()
            .references(() => diagrams.id, { onDelete: 'cascade' }),
        requesterId: uuid('requester_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // the requester's tab: it is the one told the answer
        requesterEditorId: text('requester_editor_id').notNull(),
        holderId: uuid('holder_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // the tab that held the lock when it was asked: only it may answer
        holderEditorId: text('holder_editor_id').notNull(),
        status: text('status').notNull().default('pending'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        // a pending poke stops waiting here
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        answeredAt: timestamp('answered_at', { withTimezone: true }),
    },
    (t) => [
        check(
            'lock_pokes_status_check',
            sql`${t.status} in ('pending', 'accepted', 'declined', 'left', 'expired')`
        ),
        // one poke at a time waits for an answer on a diagram
        uniqueIndex('lock_pokes_pending_idx')
            .on(t.diagramId)
            .where(sql`${t.status} = 'pending'`),
        // the wait between pokes reads a person's latest poke on a diagram
        index('lock_pokes_requester_idx').on(
            t.diagramId,
            t.requesterId,
            t.createdAt
        ),
        // the user columns are cascaded on delete
        index('lock_pokes_holder_idx').on(t.holderId),
        index('lock_pokes_requester_user_idx').on(t.requesterId),
        // old rows are pruned by age
        index('lock_pokes_created_idx').on(t.createdAt),
    ]
);

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
        // made by auto-publish (and so rewritten by the next one), as opposed to a
        // publish someone asked for, whatever note it carries
        auto: boolean('auto').notNull().default(false),
        // the same numbers as on diagrams, copied when the snapshot is made, so the
        // viewer list never reads each snapshot's content. All null for a snapshot
        // the start-up fill has not reached: readers then take them from the content.
        statDatabaseType: text('stat_database_type'),
        statDatabaseEdition: text('stat_database_edition'),
        statTableCount: integer('stat_table_count'),
        statRelationshipCount: integer('stat_relationship_count'),
        statCreatedAt: text('stat_created_at'),
        statContentBytes: integer('stat_content_bytes'),
    },
    (t) => [
        // also serves diagram_id lookups (version history, latest version)
        uniqueIndex('snapshots_diagram_version_idx').on(t.diagramId, t.version),
        // the biggest table: deleting a user sets published_by to null, and
        // without this index that scans every row of it
        index('snapshots_published_by_idx').on(t.publishedBy),
        // the hourly stats fill looks for rows it has not filled yet; the index
        // holds only those, so it is empty once the fill has caught up
        index('snapshots_stats_pending_idx')
            .on(t.id)
            .where(sql`${t.statTableCount} is null`),
    ]
);

export const auditLog = pgTable(
    'audit_log',
    {
        // the one table that grows without limit, so a bigint that cannot run out
        id: bigint('id', { mode: 'number' })
            .primaryKey()
            .generatedAlwaysAsIdentity(),
        // no FKs: audit rows must outlive deleted users and diagrams
        userId: uuid('user_id'),
        action: text('action').notNull(),
        diagramId: uuid('diagram_id'),
        at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
        // what the action was done to (which project, which user, which
        // version): ids and names, never an email or anything secret, and no
        // foreign keys, so a row still reads after its target is gone. Small and
        // never filtered or joined on. Null for diagram.update, the most frequent
        // action (every save), where diagram_id already says it all.
        meta: jsonb('meta').$type<AuditMeta>(),
    },
    (t) => [
        // an object no bigger than 1 KB, so the table that grows without limit
        // cannot be filled with large documents
        check(
            'audit_log_meta_small',
            sql`${t.meta} is null or (jsonb_typeof(${t.meta}) = 'object' and octet_length(${t.meta}::text) <= 1024)`
        ),
        // GET /admin/audit with no filter (order by at desc, id desc; it is
        // also the order of a keyset cursor) and the retention delete (at < cutoff)
        index('audit_log_at_id_idx').on(
            t.at.desc().nullsFirst(),
            t.id.desc().nullsFirst()
        ),
        // GET /admin/audit?action= and ?group= (a keyset cursor compares at and
        // id, so id is part of the index: the page walks it and stops)
        index('audit_log_action_at_idx').on(
            t.action,
            t.at.desc().nullsFirst(),
            t.id.desc().nullsFirst()
        ),
        // GET /admin/audit?diagramId=
        index('audit_log_diagram_at_idx').on(t.diagramId, t.at),
        // GET /admin/audit?userId=
        index('audit_log_user_at_idx').on(t.userId, t.at),
    ]
);

export const shareLinks = pgTable(
    'share_links',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        diagramId: uuid('diagram_id')
            .notNull()
            .references(() => diagrams.id, { onDelete: 'cascade' }),
        // sha256 of the URL token; the raw token is shown once and never stored
        tokenHash: text('token_hash').notNull().unique(),
        // AES-256-GCM of the token (key from CONNECTION_KEY) so an editor can copy
        // an active link again; null when the server has no key, for links made
        // before this column, and cleared when the link is revoked
        tokenEnc: text('token_enc'),
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
    },
    (t) => [
        // GET /diagrams/:id/share-links (a diagram's links, newest first), and
        // the cascade when a diagram is deleted
        index('share_links_diagram_idx').on(
            t.diagramId,
            t.createdAt.desc().nullsFirst()
        ),
        // deleting a user sets created_by to null
        index('share_links_created_by_idx').on(t.createdBy),
    ]
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
        // deleting a user sets owner_id to null
        index('saved_connections_owner_idx').on(t.ownerId),
    ]
);

export const driftSettings = pgTable(
    'drift_settings',
    {
        diagramId: uuid('diagram_id')
            .primaryKey()
            .references(() => diagrams.id, { onDelete: 'cascade' }),
        // connection_id is indexed: editing or deleting a connection finds the
        // settings that use it; so is updated_by, for deleting a user.
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
        updatedBy: uuid('updated_by').references(() => users.id, {
            onDelete: 'set null',
        }),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        index('drift_settings_connection_idx').on(t.connectionId),
        index('drift_settings_updated_by_idx').on(t.updatedBy),
    ]
);

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
        trigger: driftTrigger('trigger').notNull(),
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

// Counters that every server process shares: rate limits, sign-in lockout.
// One row per key; a window opens at the first hit and the row is dead once
// `expires_at` has passed (the hourly maintenance deletes dead rows). Created
// UNLOGGED by the migration: losing the counts in a crash only forgets some
// recent attempts, and writes are cheaper without the WAL.
export const rateCounters = pgTable(
    'rate_counters',
    {
        key: text('key').primaryKey(),
        count: integer('count').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    },
    (t) => [index('rate_counters_expires_idx').on(t.expiresAt)]
);

// One row per open live share stream, so the viewer caps hold across every
// server process. A stream renews its row on each heartbeat; a process that
// dies leaves rows that stop counting when they expire. UNLOGGED by the
// migration: after a crash the viewers reconnect and are counted again.
export const liveViewers = pgTable(
    'live_viewers',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        linkId: uuid('link_id').notNull(),
        ip: text('ip').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        index('live_viewers_link_idx').on(t.linkId),
        index('live_viewers_ip_idx').on(t.ip),
        index('live_viewers_expires_idx').on(t.expiresAt),
    ]
);
