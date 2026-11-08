import type { DatabaseType } from '@/core/model/database';
import { traitsOf } from '@/core/model/database';
import { isSerialType } from '@/core/commands/settle-column';
import type { TypeCapabilities } from '@/core/commands/plan-column';

/** What a column type can carry, by its catalogue id (EDT-123 to EDT-130). */

const LENGTH_TYPES = new Set([
    'char',
    'varchar',
    'nchar',
    'nvarchar',
    'character',
    'character_varying',
    'binary',
    'varbinary',
    'bit',
    'bit_varying',
    'varbit',
    'varchar2',
    'nvarchar2',
    'raw',
    'fixedstring',
]);

/** Types that accept `max` in place of a number (SQL Server). */
const MAX_TYPES = new Set(['varchar', 'nvarchar', 'varbinary']);

const PRECISION_TYPES = new Set([
    'numeric',
    'decimal',
    'number',
    'dec',
    'decimal32',
    'decimal64',
    'decimal128',
    'decimal256',
]);

const INTEGER_TYPES = new Set([
    'integer',
    'int',
    'int2',
    'int4',
    'int8',
    'bigint',
    'smallint',
    'tinyint',
    'mediumint',
]);

const idOf = (typeId: string) => typeId.trim().toLowerCase();

export interface TypeTraits {
    /** a character length can be set */
    hasLength: boolean;
    /** the length may also be `max` */
    allowsMax: boolean;
    hasPrecisionScale: boolean;
    allowsArray: boolean;
    /** auto-increment can be offered */
    canIncrement: boolean;
    /** the serial family: not null and auto-increment, always */
    serial: boolean;
}

export function traitsOfType(
    databaseType: DatabaseType,
    typeId: string
): TypeTraits {
    const id = idOf(typeId);
    const serial = isSerialType(id);
    return {
        hasLength: LENGTH_TYPES.has(id),
        allowsMax: databaseType === 'sql_server' && MAX_TYPES.has(id),
        hasPrecisionScale: PRECISION_TYPES.has(id),
        allowsArray: traitsOf(databaseType).hasArrays && !serial,
        // ClickHouse numbers nothing; an Oracle NUMBER column can be an identity
        canIncrement:
            databaseType !== 'clickhouse' &&
            (serial ||
                INTEGER_TYPES.has(id) ||
                (databaseType === 'oracle' && id === 'number')),
        serial,
    };
}

/** The shape the type-change planner wants. */
export function capabilitiesOf(
    databaseType: DatabaseType,
    typeId: string
): TypeCapabilities {
    const t = traitsOfType(databaseType, typeId);
    return {
        hasLength: t.hasLength,
        hasPrecisionScale: t.hasPrecisionScale,
        allowsArray: t.allowsArray,
    };
}

/** The largest character length the database accepts for the type, if it has a limit. */
export function lengthLimit(
    databaseType: DatabaseType,
    typeId: string
): number | undefined {
    const id = idOf(typeId);
    switch (databaseType) {
        case 'sql_server':
            if (id === 'nvarchar' || id === 'nchar') return 4000;
            return 8000;
        case 'mysql':
        case 'mariadb':
            return id === 'char' || id === 'binary' ? 255 : 65535;
        case 'postgresql':
        case 'cockroachdb':
            return 10485760;
        case 'oracle':
            if (id === 'nvarchar2') return 2000;
            if (id === 'nchar') return 1000;
            return id === 'char' || id === 'raw' ? 2000 : 4000;
        default:
            return undefined;
    }
}

export interface PrecisionRange {
    minPrecision: number;
    maxPrecision: number;
    defaultPrecision: number;
    maxScale: number;
    defaultScale: number;
}

/** The precision and scale ranges shown as hints in the attributes popover (EDT-130). */
export function precisionRange(databaseType: DatabaseType): PrecisionRange {
    switch (databaseType) {
        case 'postgresql':
        case 'cockroachdb':
            return {
                minPrecision: 1,
                maxPrecision: 1000,
                defaultPrecision: 10,
                maxScale: 1000,
                defaultScale: 0,
            };
        case 'mysql':
        case 'mariadb':
            return {
                minPrecision: 1,
                maxPrecision: 65,
                defaultPrecision: 10,
                maxScale: 30,
                defaultScale: 0,
            };
        case 'sql_server':
            return {
                minPrecision: 1,
                maxPrecision: 38,
                defaultPrecision: 18,
                maxScale: 38,
                defaultScale: 0,
            };
        default:
            return {
                minPrecision: 1,
                maxPrecision: 38,
                defaultPrecision: 10,
                maxScale: 38,
                defaultScale: 0,
            };
    }
}
