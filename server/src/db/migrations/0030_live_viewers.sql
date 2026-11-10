-- one row per open live share stream, so the viewer caps hold across server processes; UNLOGGED
-- because after a crash the viewers reconnect and are counted again, and renewals are cheaper without the WAL
CREATE UNLOGGED TABLE "live_viewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"ip" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "live_viewers_link_idx" ON "live_viewers" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "live_viewers_ip_idx" ON "live_viewers" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "live_viewers_expires_idx" ON "live_viewers" USING btree ("expires_at");