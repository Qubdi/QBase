import { describe, expect, it } from 'vitest';
import { loadFromDatabaseMetadata } from '@/formats/metadata/load';
import {
    parseMetadataText,
    repairMetadataText,
} from '@/formats/metadata/repair-text';
import { metadataScriptFor } from '../metadata-scripts';

// node:sqlite ships with Node 22.13 and later; without it the script cannot be run here
const sqlite = await import('node:sqlite').catch(() => undefined);

describe('metadata script for SQLite (IMP-056)', () => {
    it('is offered, and none for the open-only types', () => {
        expect(metadataScriptFor('sqlite')).toContain(
            'metadata_json_to_import'
        );
        expect(metadataScriptFor('oracle')).toBeUndefined();
        expect(metadataScriptFor('clickhouse')).toBeUndefined();
        expect(metadataScriptFor('generic')).toBeUndefined();
    });

    it.skipIf(!sqlite)('Cloudflare D1 variant hides its _cf_ tables', () => {
        const d1 = metadataScriptFor('sqlite', 'cloudflare_d1')!;
        expect(d1).not.toBe(metadataScriptFor('sqlite'));
        const db = new sqlite!.DatabaseSync(':memory:');
        db.exec(`
            CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value BLOB);
            CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);
        `);
        const row = db.prepare(d1).get() as { metadata_json_to_import: string };
        const parsed = JSON.parse(row.metadata_json_to_import);
        expect(parsed.tables.map((t: { table: string }) => t.table)).toEqual([
            'notes',
        ]);
        expect(parsed.columns.map((c: { table: string }) => c.table)).toEqual([
            'notes',
            'notes',
        ]);
        expect(parsed.pk_info.map((c: { table: string }) => c.table)).toEqual([
            'notes',
        ]);
    });

    it.skipIf(!sqlite)('runs on a real SQLite and its result imports', () => {
        const db = new sqlite!.DatabaseSync(':memory:');
        db.exec(`
            CREATE TABLE owners (id INTEGER PRIMARY KEY, name VARCHAR(40) NOT NULL);
            CREATE TABLE pets (
                id INTEGER PRIMARY KEY,
                owner_id INTEGER REFERENCES owners(id),
                weight DECIMAL(6,2),
                nick TEXT DEFAULT 'rex'
            );
            CREATE UNIQUE INDEX pets_nick ON pets(nick);
            CREATE VIEW pet_names AS SELECT nick FROM pets;
        `);
        const row = db.prepare(metadataScriptFor('sqlite')!).get() as {
            metadata_json_to_import: string;
        };
        const parsed = parseMetadataText(
            repairMetadataText(row.metadata_json_to_import)
        );
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const { design } = loadFromDatabaseMetadata({
            databaseType: 'sqlite',
            databaseMetadata: parsed.metadata,
        });
        const names = design.entities.order
            .map((id) => design.entities.byId[id].name)
            .sort();
        expect(names).toEqual(['owners', 'pet_names', 'pets']);
        expect(design.links.order).toHaveLength(1);
        const pets = Object.values(design.entities.byId).find(
            (e) => e.name === 'pets'
        )!;
        const columns = pets.columnIds.map((id) => design.columns[id]);
        expect(columns.map((c) => c.name)).toEqual([
            'id',
            'owner_id',
            'weight',
            'nick',
        ]);
        expect(columns[2]).toMatchObject({ precision: 6, scale: 2 });
        const owners = Object.values(design.entities.byId).find(
            (e) => e.name === 'owners'
        )!;
        expect(design.columns[owners.columnIds[1]]).toMatchObject({
            length: 40,
            nullable: false,
        });
    });
});
