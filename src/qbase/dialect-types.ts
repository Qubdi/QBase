import { dialectFor } from '@/dialects/registry';
import { typeIdOf } from '@/formats/shared/design-builder';
import { provideTypeCatalogue } from './type-catalogue';

/**
 * Tells QBase code which column types each database knows, from the dialect
 * registry (spec C6). Called once at app start (and by the test setup); ids
 * are the same as the importers give to the types they read.
 */
export function provideDialectTypes(): void {
    provideTypeCatalogue((databaseType) =>
        dialectFor(databaseType).types.map((name) => ({
            id: typeIdOf(name),
            name,
        }))
    );
}
