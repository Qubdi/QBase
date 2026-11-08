import { COLLAPSED_COLUMNS } from '@/core/model/entity';
import type { Column } from '@/core/model/column';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import type { Id } from '@/core/model/id';
import { sizeSuffix, arrayApplies } from '@/core/model/type-suffix';

export type TypeKind =
    'text' | 'number' | 'moment' | 'identifier' | 'flag' | 'document';

const MOMENT = /^(date|time|timestamp|datetime|interval|year)/;
const DOCUMENT = /^(json|jsonb|xml|hstore)$/;
const FLAG = /^(bool|boolean|bit)$/;
const IDENTIFIER = /(uuid|guid|uniqueidentifier)/;
const NUMBER =
    /^(int|integer|tinyint|smallint|mediumint|bigint|serial|smallserial|bigserial|float|double|real|decimal|numeric|number|money|smallmoney)/;

/** Which tint a type chip gets, from the type's name (EDT-046). */
export function typeKind(typeName: string): TypeKind {
    const name = typeName.trim().toLowerCase();
    if (IDENTIFIER.test(name)) return 'identifier';
    if (FLAG.test(name)) return 'flag';
    if (MOMENT.test(name)) return 'moment';
    if (DOCUMENT.test(name)) return 'document';
    if (NUMBER.test(name)) return 'number';
    return 'text';
}

/**
 * Tailwind classes for a chip of that kind. Text colours are the 700 shade in
 * the light theme and the 300 shade in the dark one; the background is the 500
 * shade at 10 %. `linked` rows (a selected line ends on them) use a green tint.
 */
export const KIND_CLASSES: Record<TypeKind, string> = {
    text: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    number: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    moment: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    identifier: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    flag: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
    document: 'bg-lime-500/10 text-lime-800 dark:text-lime-300',
};

/** The orange tint of a chip on a table that overlaps another (Highlight Overlapping Tables). */
export const OVERLAP_CHIP_CLASS =
    'bg-orange-500/10 text-orange-700 dark:text-orange-300';

/** The green tint of a chip on a field a selected line ends on. */
export const LINKED_CHIP_CLASS =
    'bg-green-500/10 text-green-800 dark:text-green-300';

/** The six tints, in the order the legend lists them (EDT-045). */
export const LEGEND_KINDS: readonly TypeKind[] = [
    'text',
    'number',
    'moment',
    'identifier',
    'flag',
    'document',
];

/**
 * The text in a type chip (EDT-113, EDT-114), a short form like the chips of
 * the old editor: the first word of the type name, `integer` as `int`, a
 * `varchar` or `character` without a size as `char`, a custom enum type as
 * `text`; then size, precision and scale, then `[]` for an array. With
 * attributes hidden only the name and an array mark remain.
 */
export function chipText(
    column: Column,
    databaseType: DatabaseType,
    showAttributes: boolean,
    enumNames?: ReadonlySet<string>
): string {
    const first = column.type.name.trim().split(/\s+/)[0] ?? '';
    const lower = first.toLowerCase();
    const suffix = sizeSuffix(column);
    const array = arrayApplies(column, databaseType) ? '[]' : '';
    let word = first;
    if (enumNames?.has(column.type.name) || enumNames?.has(column.type.id))
        word = 'text';
    else if (lower === 'integer' || lower === 'int4') word = 'int';
    else if ((lower === 'varchar' || lower === 'character') && !suffix)
        word = 'char';
    return showAttributes ? `${word}${suffix}${array}` : word + array;
}

/**
 * The columns a table shows (EDT-083). Up to ten always show. Longer tables,
 * when collapsed, keep every primary-key column and every column used by a
 * link, then fill the remaining slots from the top in the original order.
 */
export function shownColumns(
    columns: readonly Column[],
    expanded: boolean,
    linked: ReadonlySet<Id>
): Column[] {
    if (expanded || columns.length <= COLLAPSED_COLUMNS) return [...columns];
    const must = new Set(
        columns.filter((c) => c.primaryKey || linked.has(c.id)).map((c) => c.id)
    );
    const chosen = new Set(must);
    for (const c of columns) {
        if (chosen.size >= Math.max(COLLAPSED_COLUMNS, must.size)) break;
        chosen.add(c.id);
    }
    return columns.filter((c) => chosen.has(c.id));
}

/** Columns of one entity that take part in links, and the ones that hold a key. */
export function linkRoles(
    design: Pick<Design, 'links'>,
    entityId: Id
): { linked: Set<Id>; foreign: Set<Id> } {
    const linked = new Set<Id>();
    const foreign = new Set<Id>();
    for (const id of design.links.order) {
        const link = design.links.byId[id];
        if (link.sourceEntityId === entityId) linked.add(link.sourceColumnId);
        if (link.targetEntityId === entityId) {
            linked.add(link.targetColumnId);
            foreign.add(link.targetColumnId);
        }
    }
    return { linked, foreign };
}

export interface LinkNote {
    /** `references` when the column is the target, `referencedBy` otherwise */
    direction: 'references' | 'referencedBy';
    entityName: string;
    columnName: string;
}

/** The lines of the hover card that name the other end of each link. */
export function linkNotes(
    design: Design,
    entityId: Id,
    columnId: Id
): LinkNote[] {
    const notes: LinkNote[] = [];
    for (const id of design.links.order) {
        const link = design.links.byId[id];
        if (
            link.targetEntityId === entityId &&
            link.targetColumnId === columnId
        )
            notes.push({
                direction: 'references',
                entityName:
                    design.entities.byId[link.sourceEntityId]?.name ?? '',
                columnName: design.columns[link.sourceColumnId]?.name ?? '',
            });
        if (
            link.sourceEntityId === entityId &&
            link.sourceColumnId === columnId
        )
            notes.push({
                direction: 'referencedBy',
                entityName:
                    design.entities.byId[link.targetEntityId]?.name ?? '',
                columnName: design.columns[link.targetColumnId]?.name ?? '',
            });
    }
    return notes;
}

/** Header text under the name: schema, kind of view, first line of the note. */
export function subtitleParts(
    entity: {
        schema?: string;
        kind: 'table' | 'view';
        materialized?: boolean;
        comments?: string;
    },
    labels: { view: string; materializedView: string }
): string[] {
    const parts: string[] = [];
    if (entity.schema) parts.push(entity.schema);
    if (entity.kind === 'view')
        parts.push(entity.materialized ? labels.materializedView : labels.view);
    const first = entity.comments?.split('\n')[0]?.trim();
    if (first) parts.push(first);
    return parts;
}
