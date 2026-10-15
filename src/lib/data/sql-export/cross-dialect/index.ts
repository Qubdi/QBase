/**
 * Cross-dialect SQL export module.
 * Provides deterministic conversion between different database dialects.
 */

import { DatabaseType } from '@/lib/domain/database-type';
import { canConvert } from './convert/convert-schema';

// Re-export types
export type {
    TypeMapping,
    TypeMappingTable,
    IndexTypeMapping,
    IndexTypeMappingTable,
} from './types';

// Re-export PostgreSQL exporters
export { exportPostgreSQLToMySQL } from './postgresql/to-mysql';
export { exportPostgreSQLToMSSQL } from './postgresql/to-mssql';

// Re-export unsupported features detection
export {
    detectUnsupportedFeatures,
    formatWarningsHeader,
    getFieldInlineComment,
    getIndexInlineComment,
} from './unsupported-features';
export type {
    UnsupportedFeature,
    UnsupportedFeatureType,
} from './unsupported-features';

/** The databases a script can be converted to. */
const CONVERSION_TARGETS: DatabaseType[] = [
    DatabaseType.POSTGRESQL,
    DatabaseType.MYSQL,
    DatabaseType.MARIADB,
    DatabaseType.SQL_SERVER,
    DatabaseType.SQLITE,
];

/**
 * Check if deterministic cross-dialect export is supported from source to target database type.
 *
 * @param sourceDatabaseType - The source database type (diagram's original database)
 * @param targetDatabaseType - The target database type for export
 * @returns true if deterministic cross-dialect export is available, false otherwise
 *
 * @example
 * ```ts
 * hasCrossDialectSupport(DatabaseType.POSTGRESQL, DatabaseType.MYSQL) // true
 * hasCrossDialectSupport(DatabaseType.POSTGRESQL, DatabaseType.SQL_SERVER) // true
 * hasCrossDialectSupport(DatabaseType.MYSQL, DatabaseType.POSTGRESQL) // true
 * hasCrossDialectSupport(DatabaseType.ORACLE, DatabaseType.POSTGRESQL) // false (no converter)
 * ```
 */
export function hasCrossDialectSupport(
    sourceDatabaseType: DatabaseType,
    targetDatabaseType: DatabaseType
): boolean {
    // Same database type doesn't need cross-dialect conversion
    if (sourceDatabaseType === targetDatabaseType) {
        return false;
    }

    // Generic target doesn't need cross-dialect conversion
    if (targetDatabaseType === DatabaseType.GENERIC) {
        return false;
    }

    return canConvert(sourceDatabaseType, targetDatabaseType);
}

/**
 * Get all supported target database types for a given source database type.
 *
 * @param sourceDatabaseType - The source database type
 * @returns Array of supported target database types, or empty array if none
 */
export function getSupportedTargetDialects(
    sourceDatabaseType: DatabaseType
): DatabaseType[] {
    return CONVERSION_TARGETS.filter((target) =>
        hasCrossDialectSupport(sourceDatabaseType, target)
    );
}
