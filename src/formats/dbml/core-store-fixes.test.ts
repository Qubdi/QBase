import { describe, expect, it } from 'vitest';
import { detectDialect } from '@/dialects/detect';
import { columnPatchFromWire } from '@/qbase/wire-edits';
import { prepareDbml } from './prepare';

describe('review core-store 18: smaller items', () => {
    it('braces inside notes and strings do not move the table depth', () => {
        const text = [
            'Table a {',
            "  note: '''",
            '  has } a brace',
            "  '''",
            '  id int [note: "}"]',
            '  name varchar(10)',
            '}',
        ].join('\n');
        const p = prepareDbml(text.replace('name varchar(10)', 'tags text[]'));
        expect(p.arrayFields.has('a.tags')).toBe(true);
    });

    it('a MySQL or PostgreSQL script with a procedure is not SQL Server', () => {
        expect(
            detectDialect(
                'CREATE TABLE t (id int AUTO_INCREMENT);\nCREATE PROCEDURE p() BEGIN SELECT 1; END;'
            )
        ).toBe('mysql');
        expect(
            detectDialect(
                'CREATE EXTENSION x;\nCREATE PROCEDURE p() LANGUAGE sql AS $$ $$;'
            )
        ).toBe('postgresql');
        expect(detectDialect('CREATE PROCEDURE p AS SELECT 1')).toBe(
            'sql_server'
        );
    });

    it('an undefined wire value does not remove a required field', () => {
        const out = columnPatchFromWire({
            name: undefined,
            primaryKey: undefined,
        });
        expect('name' in out).toBe(false);
        expect('primaryKey' in out).toBe(false);
    });
});
