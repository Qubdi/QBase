import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import { exportFileText } from '@/core/wire/file-export';
import { importFileText } from '@/core/wire/file-import';
import { sampleS1 } from '@/dialects/testing/sample-designs';
import { collectionOf } from '@/core/model/collection';
import type { Design } from '@/core/model/design';
import type { UserType } from '@/core/model/user-type';

// DB-006: an alias type (SQL Server) is a third kind of custom type, with the
// type it is made from; it goes through the diagram file and back.

const withAlias = (): Design => {
    const design = sampleS1('sql_server');
    const alias: UserType = {
        id: 'ut-alias',
        schema: 'dbo',
        name: 'ssn_type',
        kind: 'alias',
        base: 'varchar(11)',
    };
    return { ...design, userTypes: collectionOf([alias]) };
};

describe('alias type in the diagram file', () => {
    it('is written with its kind and base, and read back the same', () => {
        const text = exportFileText(withAlias());
        const json = JSON.parse(text);
        expect(json.customTypes).toHaveLength(1);
        expect(json.customTypes[0]).toMatchObject({
            kind: 'alias',
            name: 'ssn_type',
            baseType: 'varchar(11)',
        });
        const back = importFileText(text, { now: 1 }).design;
        const [type] = listOf(back.userTypes);
        expect(type).toMatchObject({
            kind: 'alias',
            schema: 'dbo',
            name: 'ssn_type',
            base: 'varchar(11)',
        });
    });

    it('does not carry a base on an enum or a composite', () => {
        const json = JSON.parse(exportFileText(withAlias()));
        json.customTypes[0] = {
            ...json.customTypes[0],
            kind: 'enum',
            values: ['a'],
        };
        const back = importFileText(JSON.stringify(json), { now: 1 }).design;
        const [type] = listOf(back.userTypes);
        expect(type.kind).toBe('enum');
        expect(type.base).toBeUndefined();
    });

    it('still refuses a kind it does not know', () => {
        const json = JSON.parse(exportFileText(withAlias()));
        json.customTypes[0].kind = 'domain';
        expect(() =>
            importFileText(JSON.stringify(json), { now: 1 })
        ).toThrow();
    });
});
