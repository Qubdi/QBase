CREATE TYPE "public"."comment_target" AS ENUM('table', 'field', 'relationship');--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagram_id" uuid NOT NULL,
	"snapshot_version" integer DEFAULT 0 NOT NULL,
	"target_type" "comment_target" NOT NULL,
	"target_id" text NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"resolved" boolean DEFAULT false NOT NULL,
	"orphaned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_diagram_id_diagrams_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagrams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_diagram_idx" ON "comments" USING btree ("diagram_id");