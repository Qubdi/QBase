ALTER TABLE "saved_connections" DROP CONSTRAINT "saved_connections_owner_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "saved_connections_owner_name_idx";--> statement-breakpoint
ALTER TABLE "saved_connections" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_connections" ADD COLUMN "project_id" uuid;--> statement-breakpoint
-- Saved connections now belong to a project. Existing ones go to the project of
-- a diagram that uses them, otherwise to "Default". Their owners become editors
-- there so they keep using them, and duplicate names are numbered.
DO $$
DECLARE pid uuid;
BEGIN
  UPDATE saved_connections c
     SET project_id = (
       SELECT d.project_id
         FROM drift_settings s
         JOIN diagrams d ON d.id = s.diagram_id
        WHERE s.connection_id = c.id
        LIMIT 1);
  IF EXISTS (SELECT 1 FROM saved_connections WHERE project_id IS NULL) THEN
    SELECT id INTO pid FROM projects WHERE name = 'Default';
    IF pid IS NULL THEN
      INSERT INTO projects (name, description)
      VALUES ('Default', 'Diagrams that existed before projects were introduced')
      RETURNING id INTO pid;
    END IF;
    UPDATE saved_connections SET project_id = pid WHERE project_id IS NULL;
  END IF;
  INSERT INTO project_members (project_id, user_id, role)
    SELECT DISTINCT c.project_id, c.owner_id, 'editor'::project_role
      FROM saved_connections c
     WHERE c.owner_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM users u WHERE u.id = c.owner_id AND u.is_admin)
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'editor';
  UPDATE saved_connections c
     SET name = c.name || ' (' || r.n || ')'
    FROM (
      SELECT id,
             row_number() OVER (PARTITION BY project_id, name
                                ORDER BY created_at, id) AS n
        FROM saved_connections) r
   WHERE r.id = c.id AND r.n > 1;
END $$;--> statement-breakpoint
ALTER TABLE "saved_connections" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_connections" ADD CONSTRAINT "saved_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_connections" ADD CONSTRAINT "saved_connections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_connections_project_name_idx" ON "saved_connections" USING btree ("project_id","name");
