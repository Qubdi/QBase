CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_diagram_at_idx" ON "audit_log" USING btree ("diagram_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_user_at_idx" ON "audit_log" USING btree ("user_id","at");