-- The five diagram stats become plain columns the app writes (the generated ones made
-- the database parse the whole content on every save). DROP EXPRESSION only changes
-- the catalog: the stored values stay and no row is rewritten. The new snapshot
-- columns are nullable with no default, so they are added without a rewrite; the
-- server fills them in batches at start (src/diagrams/stats-fill.ts), and until then
-- readers take a missing value from the content. The five indexes are plain
-- CREATE INDEX (the migrator runs in one transaction, so not CONCURRENTLY) on small
-- tables; each takes a SHARE lock on its table while it builds.
ALTER TABLE "diagrams" ALTER COLUMN "stat_database_type" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "diagrams" ALTER COLUMN "stat_database_edition" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "diagrams" ALTER COLUMN "stat_table_count" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "diagrams" ALTER COLUMN "stat_table_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "diagrams" ALTER COLUMN "stat_relationship_count" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "diagrams" ALTER COLUMN "stat_relationship_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "diagrams" ALTER COLUMN "stat_created_at" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "diagrams" ADD COLUMN "stat_content_bytes" integer;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "stat_database_type" text;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "stat_database_edition" text;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "stat_table_count" integer;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "stat_relationship_count" integer;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "stat_created_at" text;--> statement-breakpoint
ALTER TABLE "snapshots" ADD COLUMN "stat_content_bytes" integer;--> statement-breakpoint
CREATE INDEX "diagram_locks_user_idx" ON "diagram_locks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drift_settings_updated_by_idx" ON "drift_settings" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "projects_created_by_idx" ON "projects" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "saved_connections_owner_idx" ON "saved_connections" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "share_links_created_by_idx" ON "share_links" USING btree ("created_by");