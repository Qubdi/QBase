-- One statement, so the table is rewritten once for all five columns.
ALTER TABLE "diagrams"
  ADD COLUMN "stat_database_type" text GENERATED ALWAYS AS (nullif(content->>'databaseType', '')) STORED,
  ADD COLUMN "stat_database_edition" text GENERATED ALWAYS AS (nullif(content->>'databaseEdition', '')) STORED,
  ADD COLUMN "stat_table_count" integer GENERATED ALWAYS AS (case when jsonb_typeof(content->'tables') = 'array' then jsonb_array_length(content->'tables') else 0 end) STORED NOT NULL,
  ADD COLUMN "stat_relationship_count" integer GENERATED ALWAYS AS (case when jsonb_typeof(content->'relationships') = 'array' then jsonb_array_length(content->'relationships') else 0 end) STORED NOT NULL,
  ADD COLUMN "stat_created_at" text GENERATED ALWAYS AS (nullif(content->>'createdAt', '')) STORED;
