import type { Column } from './column';
import type { Entity } from './entity';
import type { Key } from './key';
import type { Rule } from './rule';

/** An entity together with the records it owns. */
export interface EntityParts {
    entity: Entity;
    columns: Column[];
    keys: Key[];
    rules: Rule[];
}
