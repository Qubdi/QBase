import type { ExtraKeys } from './column';
import type { Id } from './id';

/**
 * A view-reads-table record. The feature is dropped for new diagrams, but a
 * saved file that has them must load and be written back unchanged, so they
 * are carried as plain records and no editing command touches them.
 */
export interface Dependency {
    id: Id;
    schema?: string;
    tableId: Id;
    dependentSchema?: string;
    dependentTableId: Id;
    createdAt: number;
    extra?: ExtraKeys;
}
