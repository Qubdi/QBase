-- Projects get a URL piece (e.g. /Qubdi/diagrams). Backfill it from the name the
-- same way the server does for new projects: words joined with dashes, URL-unsafe
-- characters dropped. Empty or reserved results get a safe fallback, and names
-- that only differ by case are numbered so the unique index can be created.
ALTER TABLE "projects" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "projects"
   SET "slug" = regexp_replace(
         regexp_replace(
           regexp_replace(
             regexp_replace(trim("name"), '\s+', '-', 'g'),
             '[^[:alnum:]._-]', '', 'g'),
           '-{2,}', '-', 'g'),
         '^[-._]+|[-._]+$', '', 'g');--> statement-breakpoint
UPDATE "projects"
   SET "slug" = 'project-' || substr("id"::text, 1, 8)
 WHERE "slug" = '';--> statement-breakpoint
UPDATE "projects"
   SET "slug" = "slug" || '-project'
 WHERE lower("slug") IN ('admin', 'api', 'assets', 'auth', 'diagrams', 'examples',
                         'health', 'login', 'logout', 'projects', 's', 'templates');--> statement-breakpoint
UPDATE "projects" p
   SET "slug" = p."slug" || '-' || r.n
  FROM (
    SELECT "id",
           row_number() OVER (PARTITION BY lower("slug")
                              ORDER BY "created_at", "id") AS n
      FROM "projects") r
 WHERE r."id" = p."id" AND r.n > 1;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_lower_idx" ON "projects" USING btree (lower("slug"));
