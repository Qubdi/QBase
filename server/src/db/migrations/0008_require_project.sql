-- Every diagram must now live in a project. Move pre-existing personal diagrams
-- into a "Default" project and carry their members over (owners/editors become
-- project editors, viewers stay viewers) so nobody loses access.
DO $$
DECLARE pid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM diagrams WHERE project_id IS NULL) THEN
    SELECT id INTO pid FROM projects WHERE name = 'Default';
    IF pid IS NULL THEN
      INSERT INTO projects (name, description)
      VALUES ('Default', 'Diagrams that existed before projects were introduced')
      RETURNING id INTO pid;
    END IF;
    INSERT INTO project_members (project_id, user_id, role)
      SELECT pid, m.user_id,
             (CASE WHEN bool_or(m.role::text IN ('owner', 'editor'))
                   THEN 'editor' ELSE 'viewer' END)::project_role
      FROM diagram_members m
      JOIN diagrams d ON d.id = m.diagram_id
      WHERE d.project_id IS NULL
      GROUP BY m.user_id
      ON CONFLICT (project_id, user_id) DO NOTHING;
    UPDATE diagrams SET project_id = pid WHERE project_id IS NULL;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "diagram_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "diagram_members" CASCADE;--> statement-breakpoint
ALTER TABLE "diagrams" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
DROP TYPE "public"."member_role";