import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import { withTables } from '@/core/testing/helpers';
import { importSql } from '@/formats/sql/import-sql';
import { mergeImported } from '../merge-into-design';

describe('IMP-076 custom types and duplicates when importing into an open diagram', () => {
    const imported = importSql(
        "CREATE TYPE mood AS ENUM ('a','b'); CREATE TABLE users (id int PRIMARY KEY, m mood); CREATE TABLE extra (id int);",
        'postgresql'
    ).design!;
    it('adds the custom types the import brings and counts them', () => {
        const current = withTables(['other']);
        const r = mergeImported(current, imported, 9);
        expect(r.addedTypes).toBe(1);
        expect(listOf(r.design.userTypes).map((t) => t.name)).toEqual(['mood']);
        expect(r.duplicates).toEqual([]);
    });
    it('does not add a type twice and names tables that already exist', () => {
        const once = mergeImported(withTables(['users']), imported, 9);
        expect(once.duplicates).toEqual(['users']);
        const twice = mergeImported(once.design, imported, 10);
        expect(twice.addedTypes).toBe(0);
        expect(listOf(twice.design.userTypes)).toHaveLength(1);
        expect(
            listOf(twice.design.entities).filter((e) => e.name === 'users')
        ).toHaveLength(3);
    });
});
