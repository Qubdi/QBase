ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "qauth_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_qauth_sub_unique" UNIQUE("qauth_sub");--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "idp_refresh_enc" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "idp_checked_at" timestamp with time zone;
