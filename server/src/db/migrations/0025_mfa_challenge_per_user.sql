-- one pending sign-in per account: keep only the newest challenge of a user that has several
DELETE FROM "mfa_challenges" a USING "mfa_challenges" b
WHERE a."user_id" = b."user_id" AND (a."expires_at", a."id") < (b."expires_at", b."id");--> statement-breakpoint
DROP INDEX "mfa_challenges_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_challenges_user_idx" ON "mfa_challenges" USING btree ("user_id");
