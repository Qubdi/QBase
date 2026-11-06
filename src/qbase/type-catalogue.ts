import type { DatabaseType } from './diagram-types';

/** A column type of a database: `id` is the catalogue key, `name` the display text. */
export interface CatalogueType {
    id: string;
    name: string;
}

export type TypeCatalogue = (
    databaseType: DatabaseType
) => readonly CatalogueType[];

let catalogue: TypeCatalogue = () => [];

/**
 * The editor tells QBase code which types each database knows. The catalogue
 * belongs to the dialects (`@/dialects`); whoever wires the dialect registry
 * into the app calls this once. Until then no type is known, and lint fixes
 * fall back to a made-up id from the type name (spec C6).
 */
export function provideTypeCatalogue(next: TypeCatalogue): void {
    catalogue = next;
}

/** The types the database knows; empty when no catalogue was provided. */
export function knownTypes(
    databaseType: DatabaseType
): readonly CatalogueType[] {
    return catalogue(databaseType);
}
