CREATE TABLE "lock_pokes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagram_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"requester_editor_id" text NOT NULL,
	"holder_id" uuid NOT NULL,
	"holder_editor_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "lock_pokes_status_check" CHECK ("lock_pokes"."status" in ('pending', 'accepted', 'declined', 'left', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "lock_pokes" ADD CONSTRAINT "lock_pokes_diagram_id_diagrams_id_fk" FOREIGN KEY ("diagram_id") REFERENCES "public"."diagrams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lock_pokes" ADD CONSTRAINT "lock_pokes_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lock_pokes" ADD CONSTRAINT "lock_pokes_holder_id_users_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lock_pokes_pending_idx" ON "lock_pokes" USING btree ("diagram_id") WHERE "lock_pokes"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "lock_pokes_requester_idx" ON "lock_pokes" USING btree ("diagram_id","requester_id","created_at");--> statement-breakpoint
CREATE INDEX "lock_pokes_holder_idx" ON "lock_pokes" USING btree ("holder_id");--> statement-breakpoint
CREATE INDEX "lock_pokes_requester_user_idx" ON "lock_pokes" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "lock_pokes_created_idx" ON "lock_pokes" USING btree ("created_at");