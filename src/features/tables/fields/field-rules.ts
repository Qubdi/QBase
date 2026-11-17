import { planChangeColumnType } from '@/core/commands/plan-column';
import type { Command } from '@/core/commands/command';
import type { Column } from '@/core/model/column';
import type { DatabaseType } from '@/core/model/database';
import type { Entity } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import type { TypeDeclaration } from '@/core/model/type-declaration';
import type { TypeOption } from './type-options';
import { capabilitiesOf, traitsOfType } from './type-traits';

export interface FieldAttributeState {
    /**
     * The Allow null box and the N toggle of the row are one setting, and are
     * locked together: a key is never null, and neither is the serial family.
     */
    nullableLocked: boolean;
    /** the Unique box is shown but cannot be changed: a lone primary key is unique */
    uniqueLocked: boolean;
    showIncrement: boolean;
    /** auto-increment needs not null, and the serial family always has it */
    incrementLocked: boolean;
    showArray: boolean;
    showLength: boolean;
    allowsMax: boolean;
    showPrecision: boolean;
}

/** Which controls the Field Attributes popover offers for a column (EDT-125 to EDT-130). */
export function fieldAttributeState(
    databaseType: DatabaseType,
    column: Column,
    columnsOfEntity: readonly Column[]
): FieldAttributeState {
    const traits = traitsOfType(databaseType, column.type.id);
    const keyCount = columnsOfEntity.filter((c) => c.primaryKey).length;
    return {
        nullableLocked: column.primaryKey || traits.serial,
        uniqueLocked: column.primaryKey && keyCount === 1,
        showIncrement: traits.canIncrement,
        incrementLocked: traits.serial || column.nullable,
        showArray: traits.allowsArray,
        showLength: traits.hasLength,
        allowsMax: traits.allowsMax,
        showPrecision: traits.hasPrecisionScale,
    };
}

/** How the Max Length control reads a column (EDT-129). */
export type LengthMode = 'none' | 'max' | 'custom';

export function lengthModeOf(column: Pick<Column, 'length'>): LengthMode {
    if (column.length === undefined) return 'none';
    return column.length === 'max' ? 'max' : 'custom';
}

/**
 * The command that gives a column a new type (EDT-123): size, precision, scale
 * and the array flag are kept when the new type has them (or take the typed
 * declaration's values); the default value is cleared.
 */
export function planPickType(
    databaseType: DatabaseType,
    entity: Pick<Entity, 'id'>,
    column: Column,
    option: TypeOption,
    declaration?: TypeDeclaration
): Command {
    const carried = declaration
        ? {
              length: declaration.length,
              precision: declaration.precision,
              scale: declaration.scale,
              isArray: declaration.isArray,
          }
        : {
              length: column.length,
              precision: column.precision,
              scale: column.scale,
              isArray: column.isArray,
          };
    return planChangeColumnType(
        entity.id,
        column.id,
        option.ref,
        capabilitiesOf(databaseType, option.ref.id),
        carried
    );
}

/** Where a dragged field lands: the new order of all column ids (EDT-136). */
export function reorderedIds(
    ids: readonly Id[],
    activeId: Id,
    overId: Id
): Id[] | undefined {
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return undefined;
    const next = ids.slice();
    next.splice(from, 1);
    next.splice(to, 0, activeId);
    return next;
}
