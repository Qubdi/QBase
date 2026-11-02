CREATE TYPE "public"."drift_status" AS ENUM('clean', 'drifted', 'error');--> statement-breakpoint
CREATE TABLE "drift_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagram_id" uuid NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "drift_status" NOT NULL,
	"trigger" text NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rename_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{"breaking":0,"warning":0,"info":0}'::jsonb NOT NULL,
	"error" text,
	"signature" text DEFAULT '' NOT NULL,
	"dismissed_at" timestamp with time zone,
	"webhook" text
);
--> statement-breakpoint
CREATE TABLE "drift_settings" (
	"diagram_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"schedule" text DEFAULT '0 3 * * *' NOT NULL,
	"connection_id" uuid,
	"schemas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_keys" jsonb DEFAULT '{"tables":{},"columns":{}}'::jsonb NOT NULL,
	"webhook_url" text,
	"next_run_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drift_reports" ADD CONSTRAINT "drift_reports_diagram_id_diagrams_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagrams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_settings" ADD CONSTRAINT "drift_settings_diagram_id_diagrams_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagrams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_settings" ADD CONSTRAINT "drift_settings_connection_id_saved_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."saved_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_settings" ADD CONSTRAINT "drift_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drift_reports_diagram_idx" ON "drift_reports" USING btree ("diagram_id","run_at");