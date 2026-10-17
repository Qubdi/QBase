-- Admin plan, step 2: what an audit row was done to, and sign-in tracking.
-- Safe on a populated database: every new column is either nullable or has a
-- default that Postgres evaluates once (now()), so no table is rewritten and no
-- row needs a backfill.
--   audit_log.meta        null on every existing row (only new actions fill it)
--   users.last_login_at   null until the person next signs in
--   sessions.created_at / last_seen_at   the day this migration ran, for a
--                         session that was already open (sessions last at most
--                         SESSION_DAYS, so that stops showing soon)
--   sessions.user_agent   null for sessions already open
-- The two CHECKs read their table once to prove the existing rows pass (all of
-- them do: the columns they test are new and null). Drizzle runs this in one
-- transaction, so audit_log, the largest table, is locked for that read.
--
-- To undo: drop the two CHECK constraints, then drop the five columns. Nothing
-- else reads them yet except the audit list, which would then omit meta.

ALTER TABLE "audit_log" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_meta_small" CHECK ("audit_log"."meta" is null or (jsonb_typeof("audit_log"."meta") = 'object' and octet_length("audit_log"."meta"::text) <= 1024));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_agent_len" CHECK (char_length("sessions"."user_agent") <= 200);