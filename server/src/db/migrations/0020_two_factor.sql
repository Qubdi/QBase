CREATE TABLE "mfa_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "mfa_challenges_attempts_nonneg" CHECK ("mfa_challenges"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret_enc" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_last_step" bigint;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mfa_challenges_user_idx" ON "mfa_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mfa_challenges_expires_idx" ON "mfa_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_recovery_codes_user_hash_idx" ON "mfa_recovery_codes" USING btree ("user_id","code_hash");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_mfa_secret_when_enabled" CHECK ("users"."mfa_enabled_at" is null or "users"."mfa_secret_enc" is not null);