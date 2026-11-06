import { describe, expect, it } from 'vitest';
import { diagramToDesign } from '@/qbase/diagram-convert';
import { exportDbml } from '@/formats/dbml/export-dbml';
import { exportBaseSQL } from './builders';
import {
    DatabaseType,
    type Diagram,
    type DBTable,
    type DBField,
} from '@/qbase/diagram-types';

let n = 0;
const field = (o: Partial<DBField>): DBField =>
    ({
        id: `f${++n}`,
        name: 'id',
        type: { id: 'integer', name: 'integer' },
        primaryKey: false,
        nullable: true,
        unique: false,
        createdAt: 0,
        ...o,
    }) as DBField;
const table = (o: Partial<DBTable>): DBTable =>
    ({
        id: `t${++n}`,
        name: 't',
        fields: [],
        indexes: [],
        createdAt: 0,
        x: 0,
        y: 0,
        width: 200,
        ...o,
    }) as DBTable;
const diagram = (type: DatabaseType, tables: DBTable[]): Diagram =>
    ({
        id: 'd',
        name: 'd',
        databaseType: type,
        tables,
        relationships: [],
        createdAt: new Date(0),
        updatedAt: new Date(0),
    }) as Diagram;

// a name that tries to end its quoting and run a statement of its own
const attack = {
    [DatabaseType.POSTGRESQL]: {
        name: 'x"; DROP TABLE users; --',
        safe: '"x""; DROP TABLE users; --"',
        raw: 'x"; DROP TABLE users',
    },
    [DatabaseType.SQLITE]: {
        name: 'x"; DROP TABLE users; --',
        safe: '"x""; DROP TABLE users; --"',
        raw: 'x"; DROP TABLE users',
    },
    [DatabaseType.MYSQL]: {
        name: 'x`; DROP TABLE users; --',
        safe: '`x``; DROP TABLE users; --`',
        raw: 'x`; DROP TABLE users',
    },
    [DatabaseType.MARIADB]: {
        name: 'x`; DROP TABLE users; --',
        safe: '`x``; DROP TABLE users; --`',
        raw: 'x`; DROP TABLE users',
    },
    [DatabaseType.SQL_SERVER]: {
        name: 'x]; DROP TABLE users; --',
        safe: '[x]]; DROP TABLE users; --]',
        raw: 'x]; DROP TABLE users',
    },
} as const;

describe('SQL export identifier escaping', () => {
    for (const [type, { name, safe, raw }] of Object.entries(attack)) {
        it(`${type}: a table, a column and an index name cannot end their own quoting`, () => {
            const sql = exportBaseSQL({
                diagram: diagram(type as DatabaseType, [
                    table({
                        name,
                        fields: [
                            field({ name, primaryKey: true, nullable: false }),
                        ],
                        indexes: [
                            {
                                id: 'i1',
                                name,
                                unique: false,
                                fieldIds: [],
                                createdAt: 0,
                            } as never,
                        ],
                    }),
                ]),
                targetDatabaseType: type as DatabaseType,
            });
            expect(sql).toContain(safe);
            expect(sql).not.toContain(raw);
        });
    }

    // DBML is no longer written through a generic SQL script: its own writer
    // (src/formats/dbml) quotes every name, so these two checks run on it.
    const dbmlOf = (name: string) =>
        exportDbml(
            diagramToDesign(
                diagram(DatabaseType.GENERIC, [
                    table({
                        name,
                        fields: [
                            field({
                                name: 'id',
                                primaryKey: true,
                                nullable: false,
                            }),
                        ],
                    }),
                ])
            ).design
        ).text;

    it('does not trust a name that only looks like a quoted identifier in DBML', () => {
        const text = dbmlOf('"a"; DROP TABLE users; --"');
        expect(text).not.toContain('Table "a"; DROP TABLE users');
        expect(text).toContain('Table "\\"a\\"; DROP TABLE users; --\\""');
    });

    it('still quotes an ordinary name in DBML', () => {
        expect(dbmlOf('plain')).toContain('Table "plain"');
    });

    it('keeps the SQL Server schema script safe for a hostile schema name', () => {
        const sql = exportBaseSQL({
            diagram: diagram(DatabaseType.SQL_SERVER, [
                table({
                    name: 't',
                    schema: "s'];DROP TABLE users;--",
                    fields: [
                        field({
                            name: 'id',
                            primaryKey: true,
                            nullable: false,
                        }),
                    ],
                }),
            ]),
            targetDatabaseType: DatabaseType.SQL_SERVER,
        });
        // in the string literal only the quote is doubled
        expect(sql).toContain("WHERE name = 's''];DROP TABLE users;--'");
        // inside EXEC('...') the ] is doubled for the identifier, then the quote for the literal
        expect(sql).toContain(
            "EXEC('CREATE SCHEMA [s'']];DROP TABLE users;--]')"
        );
    });
});
