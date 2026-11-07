import type { DatabaseType } from '@/core/model/database';

/**
 * The query a person runs in their own client to get the metadata document
 * (spec 5.1). Written for this project; each returns one cell holding the
 * JSON of spec 5.2. Databases without an entry show a note instead.
 */
const SCRIPTS: Partial<Record<DatabaseType, string>> = {};

/** The script for a database or undefined when none is shipped yet. */
export function metadataScriptFor(type: DatabaseType): string | undefined {
    return SCRIPTS[type];
}
