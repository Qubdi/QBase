import { describe, expect, it } from 'vitest';
import { exportSql } from '@/formats/sql/export-sql';
import { sampleS1, sampleS2, sampleS3 } from './testing/sample-designs';

const lines = (...l: string[]) => l.join('\n');

describe('EXP-013 EXP-014 EXP-015 EXP-017 EXP-018 EXP-019 PostgreSQL export', () => {
    it('S1', () => {
        expect(exportSql(sampleS1('postgresql'), 'postgresql').text).toBe(
            lines(
                'CREATE TABLE "customers" (',
                '    "id" serial NOT NULL,',
                '    "email" varchar(120) NOT NULL UNIQUE,',
                '    "full_name" varchar(80),',
                '    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,',
                '    PRIMARY KEY ("id")',
                ');',
                '',
                'CREATE TABLE "orders" (',
                '    "id" serial NOT NULL,',
                '    "customer_id" integer NOT NULL,',
                '    "total" numeric(10, 2) NOT NULL DEFAULT 0,',
                '    PRIMARY KEY ("id")',
                ');',
                '-- Indexes',
                'CREATE INDEX "orders_idx_orders_customer" ON "orders" ("customer_id");',
                '',
                '-- Foreign key constraints',
                '-- Schema: public',
                'ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_customer_id_customers_id" FOREIGN KEY("customer_id") REFERENCES "customers"("id");'
            )
        );
    });
    it('S2 (EXP-016 comments, composite key, check)', () => {
        expect(exportSql(sampleS2('postgresql'), 'postgresql').text).toBe(
            lines(
                'CREATE SCHEMA IF NOT EXISTS "school";',
                '',
                '-- Course catalogue',
                'CREATE TABLE "school"."courses" (',
                '    "code" varchar(10) NOT NULL,',
                '    -- Display name',
                '    "title" varchar(100) NOT NULL,',
                '    "credits" smallint NOT NULL DEFAULT 3,',
                '    PRIMARY KEY ("code"),',
                '    CHECK (credits > 0)',
                ');',
                `COMMENT ON TABLE "school"."courses" IS 'Course catalogue';`,
                `COMMENT ON COLUMN "school"."courses"."title" IS 'Display name';`,
                '',
                'CREATE TABLE "school"."enrolments" (',
                '    "student_id" integer NOT NULL,',
                '    "course_code" varchar(10) NOT NULL,',
                '    "grade" char(1),',
                '    PRIMARY KEY ("student_id", "course_code")',
                ');',
                '-- Indexes',
                'CREATE INDEX "enrolments_idx_enrol_course" ON "school"."enrolments" ("course_code", "grade");',
                '',
                '-- Foreign key constraints',
                '-- Schema: school',
                'ALTER TABLE "school"."enrolments" ADD CONSTRAINT "fk_enrolments_course_code_courses_code" FOREIGN KEY("course_code") REFERENCES "school"."courses"("code");'
            )
        );
    });
    it('S3 (EXP-013 enum type, arrays, index method)', () => {
        expect(exportSql(sampleS3('postgresql'), 'postgresql').text).toBe(
            lines(
                `CREATE TYPE "ticket_status" AS ENUM ('open', 'closed', 'it''s done');`,
                '',
                'CREATE TABLE "tickets" (',
                '    "id" bigserial NOT NULL,',
                `    "status" ticket_status NOT NULL DEFAULT 'open',`,
                '    "tags" text[],',
                `    "payload" jsonb DEFAULT '{}',`,
                '    "title" varchar(200) NOT NULL UNIQUE,',
                '    PRIMARY KEY ("id")',
                ');',
                '-- Indexes',
                'CREATE INDEX "tickets_idx_tickets_tags" ON "tickets" USING GIN ("tags");',
                'CREATE UNIQUE INDEX "tickets_uq_tickets_status_title" ON "tickets" ("status", "title");',
                ''
            )
        );
    });
});

describe('EXP-020 to EXP-025 MySQL export', () => {
    it('S1', () => {
        expect(exportSql(sampleS1('mysql'), 'mysql').text).toBe(
            lines(
                '-- MySQL database export',
                'START TRANSACTION;',
                '',
                'CREATE TABLE IF NOT EXISTS `customers` (',
                '    `id` INT NOT NULL AUTO_INCREMENT,',
                '    `email` VARCHAR(120) NOT NULL UNIQUE,',
                '    `full_name` VARCHAR(80),',
                '    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,',
                '    PRIMARY KEY (`id`)',
                ');',
                '',
                '',
                '',
                'CREATE TABLE IF NOT EXISTS `orders` (',
                '    `id` INT NOT NULL AUTO_INCREMENT,',
                '    `customer_id` INT NOT NULL,',
                '    `total` DECIMAL(10, 2) NOT NULL DEFAULT 0,',
                '    PRIMARY KEY (`id`)',
                ');',
                '',
                '-- Indexes',
                'CREATE INDEX `idx_orders_customer_id` ON `orders` (`customer_id`);',
                '',
                '-- Foreign key constraints',
                'ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_customer_id` FOREIGN KEY(`customer_id`) REFERENCES `customers`(`id`);',
                '',
                'COMMIT;',
                ''
            )
        );
    });
    it('S2 (EXP-024 comments)', () => {
        expect(exportSql(sampleS2('mysql'), 'mysql').text).toBe(
            lines(
                '-- MySQL database export',
                'START TRANSACTION;',
                '-- Course catalogue',
                '',
                'CREATE TABLE IF NOT EXISTS `courses` (',
                '    `code` VARCHAR(10) NOT NULL,',
                '    -- Display name',
                "    `title` VARCHAR(100) NOT NULL COMMENT 'Display name',",
                '    `credits` SMALLINT NOT NULL DEFAULT 3,',
                '    PRIMARY KEY (`code`),',
                '    CHECK (credits > 0)',
                ") COMMENT='Course catalogue';",
                '',
                '',
                '',
                'CREATE TABLE IF NOT EXISTS `enrolments` (',
                '    `student_id` INT NOT NULL,',
                '    `course_code` VARCHAR(10) NOT NULL,',
                '    `grade` CHAR(1),',
                '    PRIMARY KEY (`student_id`, `course_code`)',
                ');',
                '',
                '-- Indexes',
                'CREATE INDEX `idx_enrolments_course_code_grade` ON `enrolments` (`course_code`, `grade`);',
                '',
                '-- Foreign key constraints',
                'ALTER TABLE `enrolments` ADD CONSTRAINT `fk_enrolments_course_code` FOREIGN KEY(`course_code`) REFERENCES `courses`(`code`);',
                '',
                'COMMIT;',
                ''
            )
        );
    });
    it('S3 (EXP-020 database, EXP-021 types, EXP-022 prefix); spec sample shows three blank lines after CREATE DATABASE, the rule says two', () => {
        expect(exportSql(sampleS3('mysql'), 'mysql').text).toBe(
            lines(
                '-- MySQL database export',
                'START TRANSACTION;',
                'CREATE DATABASE IF NOT EXISTS `app`;',
                '',
                '',
                'CREATE TABLE IF NOT EXISTS `app`.`events` (',
                '    `id` BIGINT NOT NULL AUTO_INCREMENT,',
                '    `code` VARCHAR(255) NOT NULL UNIQUE,',
                '    `body` TEXT,',
                '    `active` TINYINT(1) NOT NULL DEFAULT true,',
                '    `payload` JSON,',
                '    PRIMARY KEY (`id`)',
                ');',
                '',
                '-- Indexes',
                'CREATE INDEX `idx_events_body` ON `app`.`events` (`body`(255));',
                'CREATE UNIQUE INDEX `idx_events_code_unique` ON `app`.`events` (`code`);',
                '',
                '',
                'COMMIT;',
                ''
            )
        );
    });
});

describe('EXP-026 to EXP-031 SQL Server export', () => {
    it('S1', () => {
        expect(exportSql(sampleS1('sql_server'), 'sql_server').text).toBe(
            lines(
                'CREATE TABLE [customers] (',
                '    [id] int NOT NULL IDENTITY(1,1),',
                '    [email] varchar(120) NOT NULL UNIQUE,',
                '    [full_name] varchar(80),',
                '    [created_at] datetime2 NOT NULL DEFAULT getdate(),',
                '    PRIMARY KEY ([id])',
                ');',
                '',
                '',
                'CREATE TABLE [orders] (',
                '    [id] int NOT NULL IDENTITY(1,1),',
                '    [customer_id] int NOT NULL,',
                '    [total] decimal(10, 2) NOT NULL DEFAULT 0,',
                '    PRIMARY KEY ([id])',
                ');',
                '',
                '-- Indexes',
                'CREATE INDEX [idx_orders_customer] ON [orders] ([customer_id]);',
                '',
                '-- Foreign key constraints',
                '-- Schema: dbo',
                'ALTER TABLE [orders] ADD CONSTRAINT [fk_orders_customers] FOREIGN KEY([customer_id]) REFERENCES [customers]([id]);'
            )
        );
    });
    it('S2 (EXP-031 comment block)', () => {
        expect(exportSql(sampleS2('sql_server'), 'sql_server').text).toBe(
            lines(
                "IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'school')",
                'BEGIN',
                "    EXEC('CREATE SCHEMA [school]');",
                'END;',
                '/**',
                'Course catalogue',
                '*/',
                'CREATE TABLE [school].[courses] (',
                '    [code] varchar(10) NOT NULL,',
                '    -- Display name',
                '    [title] varchar(100) NOT NULL,',
                '    [credits] smallint NOT NULL DEFAULT 3,',
                '    PRIMARY KEY ([code]),',
                '    CHECK (credits > 0)',
                ');',
                '',
                '',
                'CREATE TABLE [school].[enrolments] (',
                '    [student_id] int NOT NULL,',
                '    [course_code] varchar(10) NOT NULL,',
                '    [grade] char(1),',
                '    PRIMARY KEY ([student_id], [course_code])',
                ');',
                '',
                '-- Indexes',
                'CREATE INDEX [school_idx_enrol_course] ON [school].[enrolments] ([course_code], [grade]);',
                '',
                '-- Foreign key constraints',
                '-- Schema: school',
                'ALTER TABLE [school].[enrolments] ADD CONSTRAINT [fk_enrol_course] FOREIGN KEY([course_code]) REFERENCES [school].[courses]([code]);'
            )
        );
    });
    it('S3 (EXP-027 MAX, EXP-028 defaults unwrapped)', () => {
        expect(exportSql(sampleS3('sql_server'), 'sql_server').text).toBe(
            lines(
                'CREATE TABLE [Invoice] (',
                '    [Id] int NOT NULL IDENTITY(1,1),',
                '    [Number] varchar(MAX) NOT NULL,',
                '    [IssuedAt] datetimeoffset NOT NULL DEFAULT sysdatetimeoffset(),',
                '    [Total] money NOT NULL DEFAULT 0,',
                '    [Paid] bit NOT NULL DEFAULT 0,',
                "    [Note] nvarchar(500) DEFAULT N'n/a',",
                '    PRIMARY KEY ([Id])',
                ');',
                '',
                '-- Indexes',
                'CREATE UNIQUE INDEX [IX_Invoice_Number] ON [Invoice] ([Number]);',
                ''
            )
        );
    });
});

describe('EXP-032 to EXP-036 SQLite export', () => {
    it('S1', () => {
        expect(exportSql(sampleS1('sqlite'), 'sqlite').text).toBe(
            lines(
                '-- SQLite database export',
                'PRAGMA foreign_keys = ON;',
                '',
                'BEGIN TRANSACTION;',
                'CREATE TABLE IF NOT EXISTS "customers" (',
                '    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,',
                '    "email" VARCHAR(120) NOT NULL UNIQUE,',
                '    "full_name" VARCHAR(80),',
                '    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
                ');',
                '',
                '',
                'CREATE TABLE IF NOT EXISTS "orders" (',
                '    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,',
                '    "customer_id" INTEGER NOT NULL,',
                '    "total" DECIMAL(10, 2) NOT NULL DEFAULT 0,',
                '    FOREIGN KEY("customer_id") REFERENCES "customers"("id")',
                ');',
                '',
                '-- Indexes',
                'CREATE INDEX IF NOT EXISTS "orders_idx_orders_customer"',
                'ON "orders" ("customer_id");',
                '',
                'COMMIT;',
                ''
            )
        );
    });
    it('S2 (composite key, check)', () => {
        expect(exportSql(sampleS2('sqlite'), 'sqlite').text).toBe(
            lines(
                '-- SQLite database export',
                'PRAGMA foreign_keys = ON;',
                '',
                'BEGIN TRANSACTION;',
                '-- Course catalogue',
                'CREATE TABLE IF NOT EXISTS "courses" (',
                '    "code" VARCHAR(10) NOT NULL,',
                '    -- Display name',
                '    "title" VARCHAR(100) NOT NULL,',
                '    "credits" SMALLINT NOT NULL DEFAULT 3,',
                '    PRIMARY KEY ("code"),',
                '    CHECK (credits > 0)',
                ');',
                '',
                '',
                'CREATE TABLE IF NOT EXISTS "enrolments" (',
                '    "student_id" INTEGER NOT NULL,',
                '    "course_code" VARCHAR(10) NOT NULL,',
                '    "grade" CHAR(1),',
                '    PRIMARY KEY ("student_id", "course_code"),',
                '    FOREIGN KEY("course_code") REFERENCES "courses"("code")',
                ');',
                '',
                '-- Indexes',
                'CREATE INDEX IF NOT EXISTS "enrolments_idx_enrol_course"',
                'ON "enrolments" ("course_code", "grade");',
                '',
                'COMMIT;',
                ''
            )
        );
    });
    it('S3 (EXP-033 system table skipped)', () => {
        expect(exportSql(sampleS3('sqlite'), 'sqlite').text).toBe(
            lines(
                '-- SQLite database export',
                'BEGIN TRANSACTION;',
                'CREATE TABLE IF NOT EXISTS "files" (',
                '    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,',
                '    "path" VARCHAR(255) NOT NULL UNIQUE,',
                '    "size" BIGINT,',
                '    "is_public" BOOLEAN NOT NULL DEFAULT 0,',
                '    "checksum" BLOB',
                ');',
                '',
                '-- Indexes',
                'CREATE UNIQUE INDEX IF NOT EXISTS "files_uq_files_path_size"',
                'ON "files" ("path", "size");',
                '',
                '-- Skipping SQLite system table: "sqlite_sequence"',
                '',
                'COMMIT;',
                ''
            )
        );
    });
});
