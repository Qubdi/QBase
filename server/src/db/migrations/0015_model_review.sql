-- Model review (admin plan, step 1): missing indexes, one type change and two
-- integrity rules. No behaviour change. Safe on a populated database.
--
-- Drizzle runs this in one transaction, so the indexes are built without
-- CONCURRENTLY: writes to the table wait while its index is built. That is
-- fine at today's sizes. audit_log is the table to watch: changing id to
-- bigint rewrites it and holds a lock on it while it runs.
--
-- To undo: drop the indexes created here and recreate audit_log_at_idx on
-- (at); drop users_email_lower_idx; change drift_reports.trigger back with
-- USING "trigger"::text and drop the drift_trigger type; change audit_log.id
-- back to a serial (drop the identity, create a sequence owned by the column
-- that starts after the highest id, set it as the default).

-- 1. drift_reports.trigger was free text. Only 'manual' and 'schedule' have
--    ever been written, so every stored row converts.
CREATE TYPE "public"."drift_trigger" AS ENUM('manual', 'schedule');--> statement-breakpoint
ALTER TABLE "drift_reports" ALTER COLUMN "trigger" SET DATA TYPE "public"."drift_trigger" USING "trigger"::"public"."drift_trigger";--> statement-breakpoint

-- 2. audit_log.id: serial (int4, runs out at 2.1 billion) becomes
--    bigint generated always as identity. Numbering carries on from where the
--    old sequence stopped, so an id is never reused, even if the newest rows
--    were purged.
DO $$
DECLARE
	next_id bigint;
BEGIN
	SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END
	  INTO next_id
	  FROM "audit_log_id_seq";
	ALTER TABLE "audit_log" ALTER COLUMN "id" DROP DEFAULT;
	DROP SEQUENCE "audit_log_id_seq";
	ALTER TABLE "audit_log" ALTER COLUMN "id" SET DATA TYPE bigint;
	EXECUTE format(
		'ALTER TABLE "audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" START WITH %s)',
		next_id
	);
END $$;--> statement-breakpoint

-- 3. Emails are lowercased by the app; make the database enforce it too. If two
--    accounts differ only by letter case the index cannot be built, so say so
--    plainly (without printing the addresses) instead of failing with a key error.
DO $$
DECLARE
	clashes integer;
BEGIN
	SELECT count(*) INTO clashes FROM (
		SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1
	) d;
	IF clashes > 0 THEN
		RAISE EXCEPTION '% email address(es) are used by more than one account when letter case is ignored. Find them with: select lower(email), count(*) from users group by 1 having count(*) > 1. Merge or rename the extra accounts, then start the server again.', clashes;
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint

-- 4. Indexes on foreign keys that had none (deletes and cascades scanned the
--    whole table), and on the audit log's reads.
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "diagrams_project_idx" ON "diagrams" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "diagrams_owner_idx" ON "diagrams" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "share_links_diagram_idx" ON "share_links" USING btree ("diagram_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "snapshots_published_by_idx" ON "snapshots" USING btree ("published_by");--> statement-breakpoint
CREATE INDEX "audit_log_at_id_idx" ON "audit_log" USING btree ("at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_log_action_at_idx" ON "audit_log" USING btree ("action","at" DESC NULLS FIRST);--> statement-breakpoint
-- audit_log_at_idx (at) is replaced by audit_log_at_id_idx above, which serves
-- the same range reads and the retention delete
DROP INDEX "audit_log_at_idx";
