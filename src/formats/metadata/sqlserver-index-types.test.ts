import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import { rng } from '@/core/testing/helpers';
import { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { loadFromDatabaseMetadata } from './load';

// What the server's SQL Server introspection returns for the index types that
// have no key columns (DB-004).

const col = (table: string, name: string, type: string, position: number) => ({
    schema: 'dbo',
    table,
    name,
    type,
    ordinal_position: position,
    nullable: true,
});

const idx = (
    table: string,
    name: string,
    column: string,
    index_type: string,
    column_position: number
) => ({
    schema: 'dbo',
    table,
    name,
    column,
    index_type,
    unique: false,
    primary: false,
    direction: 'ASC',
    column_position,
    where: null,
});

const META = {
    database_name: 'shop',
    version: 'Microsoft SQL Server 2022',
    tables: [
        { schema: 'dbo', table: 'facts' },
        { schema: 'dbo', table: 'docs' },
        { schema: 'dbo', table: 'places' },
    ],
    views: [],
    columns: [
        col('facts', 'a', 'int', 1),
        col('facts', 'b', 'int', 2),
        col('docs', 'body', 'xml', 1),
        col('places', 'shape', 'geometry', 1),
    ],
    pk_info: [],
    fk_info: [],
    indexes: [
        idx('facts', 'cci_facts', 'a', 'CLUSTERED COLUMNSTORE', 1),
        idx('facts', 'cci_facts', 'b', 'CLUSTERED COLUMNSTORE', 2),
        idx('docs', 'xi_docs', 'body', 'XML', 1),
        idx('places', 'si_places', 'shape', 'SPATIAL', 1),
    ],
};

describe('SQL Server metadata: indexes without key columns', () => {
    const { design } = loadFromDatabaseMetadata({
        databaseType: 'sql_server',
        databaseMetadata: DatabaseMetadata.parse(META),
        now: 1,
        random: rng(),
    });
    const keysOf = (name: string) => {
        const entity = listOf(design.entities).find((e) => e.name === name)!;
        return entity.keyIds.map((id) => design.keys[id]);
    };

    it('a columnstore index keeps its method and all its columns, in order', () => {
        const [key] = keysOf('facts');
        expect(key.algorithm).toBe('columnstore');
        expect(key.members.map((id) => design.columns[id].name)).toEqual([
            'a',
            'b',
        ]);
    });

    it('an XML and a spatial index keep their methods', () => {
        expect(keysOf('docs')[0].algorithm).toBe('xml');
        expect(keysOf('places')[0].algorithm).toBe('spatial');
    });

});
