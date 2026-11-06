CREATE TABLE "diagram_locks" (
	"diagram_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"editor_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagram_locks" ADD CONSTRAINT "diagram_locks_diagram_id_diagrams_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagrams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagram_locks" ADD CONSTRAINT "diagram_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;