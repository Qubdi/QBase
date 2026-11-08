import type { Column, TypeRef } from '@/core/model/column';
import type { DatabaseType } from '@/core/model/database';
import { parseTypeDeclaration } from '@/core/model/type-declaration';
import type { TypeDeclaration } from '@/core/model/type-declaration';
import { sizeSuffix } from '@/core/model/type-suffix';
import type { UserType } from '@/core/model/user-type';
import { typeRefOfUserType } from '@/core/model/user-type';
import { dialectFor } from '@/dialects/registry';
import { typeIdOf } from '@/formats/shared/design-builder';

/** The types people reach for first, per database (EDT-119). */
const COMMON: Partial<Record<DatabaseType, readonly string[]>> = {
    postgresql: [
        'integer',
        'bigint',
        'varchar',
        'text',
        'boolean',
        'timestamp',
        'timestamptz',
        'date',
        'uuid',
        'numeric',
        'jsonb',
    ],
    mysql: [
        'int',
        'bigint',
        'varchar',
        'text',
        'tinyint',
        'datetime',
        'timestamp',
        'date',
        'decimal',
        'json',
    ],
    mariadb: [
        'int',
        'bigint',
        'varchar',
        'text',
        'tinyint',
        'datetime',
        'timestamp',
        'date',
        'decimal',
        'json',
    ],
    sql_server: [
        'int',
        'bigint',
        'varchar',
        'nvarchar',
        'bit',
        'datetime2',
        'date',
        'decimal',
        'uniqueidentifier',
    ],
    sqlite: ['integer', 'text', 'real', 'blob', 'numeric'],
    oracle: [
        'number',
        'varchar2',
        'nvarchar2',
        'char',
        'clob',
        'date',
        'timestamp',
        'blob',
        'raw',
    ],
};

export interface TypeOption {
    ref: TypeRef;
    group: 'standard' | 'custom';
    /** values of an enum, shown beside its name */
    description?: string;
}

export interface TypeOptions {
    standard: TypeOption[];
    custom: TypeOption[];
}

/** Standard types of the database (common ones first, then alphabetical) and the design's own types. */
export function typeOptions(
    databaseType: DatabaseType,
    userTypes: readonly UserType[] = []
): TypeOptions {
    const names = dialectFor(databaseType).types;
    const common = (COMMON[databaseType] ?? []).filter((n) =>
        names.includes(n)
    );
    const rest = names
        .filter((n) => !common.includes(n))
        .sort((a, b) => a.localeCompare(b));
    const standard = [...common, ...rest].map((name): TypeOption => ({
        ref: { id: typeIdOf(name), name },
        group: 'standard',
    }));
    const custom = userTypes.map((type): TypeOption => {
        const description =
            type.kind === 'enum' && type.values?.length
                ? type.values.join(' | ')
                : undefined;
        return {
            ref: typeRefOfUserType(type),
            group: 'custom',
            ...(description ? { description } : {}),
        };
    });
    return { standard, custom };
}

/** Options whose name contains the search text, case-insensitively. */
export function filterTypeOptions(
    options: TypeOptions,
    search: string
): TypeOptions {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    const keep = (o: TypeOption) => o.ref.name.toLowerCase().includes(needle);
    return {
        standard: options.standard.filter(keep),
        custom: options.custom.filter(keep),
    };
}

export interface TypedChoice {
    option: TypeOption;
    declaration: TypeDeclaration;
}

/**
 * A full declaration typed into the search box (`varchar(255)`,
 * `numeric(10,2)`, `integer[]`) when its name is a type of the database or a
 * custom type (EDT-121). The suffix list says which names take a single number
 * as a length; `undefined` when the text is not a declaration or names no type.
 */
export function readTypedDeclaration(
    options: TypeOptions,
    text: string
): TypedChoice | undefined {
    const declaration = parseTypeDeclaration(text);
    if (!declaration) return undefined;
    const hasSize =
        declaration.length !== undefined ||
        declaration.precision !== undefined ||
        declaration.isArray === true;
    if (!hasSize) return undefined;
    const wanted = declaration.name.toLowerCase();
    const option = [...options.standard, ...options.custom].find(
        (o) => o.ref.name.toLowerCase() === wanted
    );
    return option ? { option, declaration } : undefined;
}

/** The attribute suffix an option shows when the field already has this type (EDT-122). */
export function optionSuffix(
    option: TypeOption,
    column: Pick<Column, 'type' | 'length' | 'precision' | 'scale' | 'isArray'>,
    arraysApply: boolean
): string {
    if (column.type.id.toLowerCase() !== option.ref.id.toLowerCase()) return '';
    return `${sizeSuffix(column)}${column.isArray && arraysApply ? '[]' : ''}`;
}
