-- counters every server process shares (rate limits, sign-in lockout); UNLOGGED because a crash that
-- forgets some recent attempts costs nothing and the writes are cheaper without the WAL
CREATE UNLOGGED TABLE "rate_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_counters_expires_idx" ON "rate_counters" USING btree ("expires_at");
