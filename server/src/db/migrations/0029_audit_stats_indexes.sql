-- The activity log's action index gains `id`, so a filtered keyset page (?action=,
-- ?group= with a cursor) walks one index and stops instead of filtering the whole
-- at/id index. A partial index on snapshots holds only the rows the stats fill has
-- not reached, so the hourly fill stops scanning the whole table. Plain CREATE INDEX
-- (the migrator runs in one transaction, so not CONCURRENTLY): each takes a SHARE
-- lock on its table while it builds.
DROP INDEX "audit_log_action_at_idx";--> statement-breakpoint
CREATE INDEX "snapshots_stats_pending_idx" ON "snapshots" USING btree ("id") WHERE "snapshots"."stat_table_count" is null;--> statement-breakpoint
CREATE INDEX "audit_log_action_at_idx" ON "audit_log" USING btree ("action","at" DESC NULLS FIRST,"id" DESC NULLS FIRST);