import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import { loadFromDatabaseMetadata } from '@/lib/data/import-metadata/import';
import { createRelationshipsFromMetadata } from '@/lib/data/import-metadata/import/relationships';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import {
    parseMetadataText,
    repairMetadataText,
    selectMetadata,
} from './repair-text';

const ZOO = {
    database_name: 'zoo',
    version: 'PostgreSQL 16.2',
    tables: [
        { schema: 'public', table: 'keepers', comment: 'People' },
        { schema: 'public', table: 'animals' },
    ],
    views: [],
    columns: [
        {
            schema: 'public',
            table: 'keepers',
            name: 'id',
            type: 'integer',
            ordinal_position: 1,
            nullable: false,
            is_identity: true,
        },
        {
            schema: 'public',
            table: 'keepers',
            name: 'name',
            type: 'character varying',
            ordinal_position: 2,
            nullable: false,
            character_maximum_length: '60',
        },
        {
            schema: 'public',
            table: 'animals',
            name: 'id',
            type: 'integer',
            ordinal_position: 1,
            nullable: false,
        },
        {
            schema: 'public',
            table: 'animals',
            name: 'keeper_id',
            type: 'integer',
            ordinal_position: 2,
            nullable: true,
        },
        {
            schema: 'public',
            table: 'animals',
            name: 'weight',
            type: 'numeric',
            ordinal_position: 3,
            nullable: true,
            precision: { precision: 6, scale: 2 },
        },
    ],
    pk_info: [
        {
            schema: 'public',
            table: 'keepers',
            column: 'id',
            pk_def: 'PRIMARY KEY (id)',
        },
        {
            schema: 'public',
            table: 'animals',
            column: 'id',
            pk_def: 'PRIMARY KEY (id)',
        },
    ],
    fk_info: [
        {
            schema: 'public',
            table: 'animals',
            column: 'keeper_id',
            foreign_key_name: 'animals_keeper_fk',
            reference_schema: 'public',
            reference_table: 'keepers',
            reference_column: 'id',
            fk_def: 'FOREIGN KEY (keeper_id) REFERENCES keepers(id)',
        },
    ],
    indexes: [
        {
            schema: 'public',
            table: 'animals',
            name: 'animals_keeper_idx',
            column: 'keeper_id',
            index_type: 'btree',
            unique: false,
            direction: 'ASC',
            column_position: 1,
        },
    ],
} satisfies DatabaseMetadata;

describe('IMP-059 IMP-060 IMP-061 IMP-063 IMP-065 metadata import (zoo sample)', () => {
    const { design, diagnostics } = loadFromDatabaseMetadata({
        databaseType: 'postgresql',
        databaseMetadata: ZOO,
    });
    const named = (n: string) => {
        const e = listOf(design.entities).find((x) => x.name === n)!;
        return {
            e,
            cols: e.columnIds.map((id) => design.columns[id]),
            keys: e.keyIds.map((id) => design.keys[id]),
        };
    };
    it('builds the expected diagram', () => {
        expect(diagnostics).toEqual([]);
        expect(design.name).toBe('zoo');
        expect(
            listOf(design.entities).map((e) => [e.name, e.schema, e.color])
        ).toEqual([
            ['animals', 'public', '#8eb7ff'],
            ['keepers', 'public', '#8eb7ff'],
        ]);
        const keepers = named('keepers');
        expect(keepers.e.comments).toBe('People');
        expect(keepers.cols[0]).toMatchObject({
            type: { name: 'integer' },
            primaryKey: true,
            nullable: false,
            increment: true,
        });
        expect(keepers.cols[1]).toMatchObject({
            type: { name: 'varchar' },
            length: 60,
            nullable: false,
        });
        const animals = named('animals');
        expect(animals.cols[2]).toMatchObject({
            type: { name: 'numeric' },
            precision: 6,
            scale: 2,
        });
        expect(animals.keys.map((k) => [k.label, !!k.pk])).toEqual([
            ['', true],
            ['animals_keeper_idx', false],
        ]);
        expect(keepers.keys.filter((k) => k.pk)).toHaveLength(1);
        const link = listOf(design.links)[0];
        expect(link).toMatchObject({
            name: 'animals_keeper_fk',
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
        expect(design.entities.byId[link.sourceEntityId].name).toBe('keepers');
    });
    it('IMP-063 drops a foreign key whose table is missing', () => {
        const links = createRelationshipsFromMetadata(
            [{ ...ZOO.fk_info[0], reference_table: 'ghosts' }],
            { hasColumn: () => false }
        );
        expect(links).toEqual([]);
    });
});

describe('IMP-062 views and dependencies, materialized', () => {
    it('reads a view with its definition', () => {
        const def = Buffer.from(
            'CREATE MATERIALIZED VIEW public.v AS SELECT id FROM public.keepers',
            'utf8'
        ).toString('base64');
        const meta = {
            ...ZOO,
            tables: [
                ...ZOO.tables,
                { schema: 'public', table: 'v', type: 'VIEW' },
            ],
            views: [{ schema: 'public', view_name: 'v', view_definition: def }],
            columns: [
                ...ZOO.columns,
                {
                    schema: 'public',
                    table: 'v',
                    name: 'id',
                    type: 'integer',
                    ordinal_position: 1,
                    nullable: true,
                },
            ],
        };
        const { design } = loadFromDatabaseMetadata({
            databaseType: 'postgresql',
            databaseMetadata: meta,
        });
        const v = listOf(design.entities).find((e) => e.name === 'v')!;
        expect(v).toMatchObject({
            kind: 'view',
            materialized: true,
            color: '#7d7d7d',
        });
        expect(listOf(design.entities).map((e) => e.name)).toEqual([
            'animals',
            'keepers',
            'v',
        ]);
        expect(design.dependencies).toHaveLength(1);
        expect(design.entities.byId[design.dependencies[0].tableId].name).toBe(
            'keepers'
        );
    });
});

describe('IMP-057 repairing pasted text', () => {
    const doc = JSON.stringify(ZOO);
    it('unwraps the wrapper object and gives the same model', () => {
        const wrapped = JSON.stringify([{ metadata_json_to_import: doc }]);
        const fixed = repairMetadataText(wrapped);
        const parsed = parseMetadataText(fixed);
        expect(parsed.ok).toBe(true);
    });
    it('removes terminal decoration, trailing commas and text values', () => {
        const messy = `│ ${doc.replace('"nullable":false,"is_identity"', '"nullable":"false","is_identity"').replace('}],"views"', '},],"views"')} │`;
        expect(parseMetadataText(repairMetadataText(messy)).ok).toBe(true);
    });
    it('undoes CSV doubling and escaped quotes', () => {
        expect(
            parseMetadataText(repairMetadataText(doc.replace(/"/g, '""'))).ok
        ).toBe(true);
        expect(
            parseMetadataText(repairMetadataText(JSON.stringify(doc))).ok
        ).toBe(true);
    });
    it('a box without braces shows the fixed message', () => {
        const r = parseMetadataText('nope');
        expect(r.ok).toBe(false);
    });
});

describe('IMP-064 selecting tables', () => {
    it('keeps selected tables and foreign keys touching them', () => {
        const picked = selectMetadata(ZOO, new Set(['public.animals']));
        expect(picked.tables.map((t) => t.table)).toEqual(['animals']);
        expect(picked.fk_info).toHaveLength(1);
        const { design } = loadFromDatabaseMetadata({
            databaseType: 'postgresql',
            databaseMetadata: picked,
        });
        expect(design.links.order).toHaveLength(0);
    });
});

describe('IMP-059 the server fixture is accepted by the contract', () => {
    it('parses and loads', async () => {
        const { readFileSync } = await import('node:fs');
        const text = readFileSync(
            'server/test/fixtures/postgres-metadata.json',
            'utf8'
        );
        const parsed = parseMetadataText(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const { design } = loadFromDatabaseMetadata({
            databaseType: 'postgresql',
            databaseMetadata: parsed.metadata,
        });
        expect(design.entities.order.length).toBeGreaterThanOrEqual(4);
        expect(
            listOf(design.entities).filter((e) => e.kind === 'view')
        ).toHaveLength(1);
    });
});
