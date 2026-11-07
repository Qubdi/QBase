import { apply } from '@/core/commands/apply';
import type { Command } from '@/core/commands/command';
import { planLink, typesCompatible } from '@/core/commands/plan-link';
import type { Column, TypeRef } from '@/core/model/column';
import { createColumn } from '@/core/model/defaults';
import type { Design } from '@/core/model/design';
import type { Id } from '@/core/model/id';
import { columnsOf, entityOf } from '@/core/model/lookup';
import type { EditorStore } from '@/store/editor-store';

/** A serial column is filled by the database; the field that points at it is plain. */
const PLAIN_COUNTERPART: Record<string, string> = {
    serial: 'integer',
    smallserial: 'smallint',
    bigserial: 'bigint',
};

export type TargetChoice =
    { kind: 'existing'; columnId: Id } | { kind: 'new'; name: string };

export interface TargetSuggestion {
    /** the key field of the source table the link starts from */
    sourceColumnId: Id;
    choice: TargetChoice;
}

/** The key column a table-to-table link starts from (EDT-158). */
export function sourceKeyOf(design: Design, entityId: Id): Column | undefined {
    const entity = entityOf(design, entityId);
    return entity && columnsOf(design, entity).find((c) => c.primaryKey);
}

/**
 * What the create-relationship card offers first (EDT-159): the first field
 * of the target table whose type fits the source key, or, when none does, a
 * new field named after the source table and its key. Undefined when the
 * source table has no primary key.
 */
export function suggestTarget(
    design: Design,
    sourceEntityId: Id,
    targetEntityId: Id
): TargetSuggestion | undefined {
    const key = sourceKeyOf(design, sourceEntityId);
    const source = entityOf(design, sourceEntityId);
    const target = entityOf(design, targetEntityId);
    if (!key || !source || !target) return undefined;
    const fields = columnsOf(design, target);
    const fit = fields.find(
        (c) =>
            c.id !== key.id &&
            typesCompatible(design.databaseType, key.type, c.type)
    );
    if (fit)
        return {
            sourceColumnId: key.id,
            choice: { kind: 'existing', columnId: fit.id },
        };
    const taken = new Set(fields.map((c) => c.name.toLowerCase()));
    const base = `${source.name}_${key.name}`;
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}_${n}`;
    return { sourceColumnId: key.id, choice: { kind: 'new', name } };
}

export type QuickLinkPlan =
    | { ok: true; command: Command; linkId: Id }
    | { ok: false; error: 'no-key' | 'no-field' | 'no-link' };

function counterpartType(type: TypeRef): TypeRef {
    const plain = PLAIN_COUNTERPART[type.id.toLowerCase()];
    return plain ? { id: plain, name: plain } : { ...type };
}

/**
 * The one command that finishes a table-to-table link (EDT-160): add the
 * target field when a new one was asked for (same type as the source key,
 * nullable), then the link. Errors map to the card's inline messages
 * (EDT-161).
 */
export function planQuickLink(
    design: Design,
    sourceEntityId: Id,
    targetEntityId: Id,
    choice: TargetChoice,
    options: { now?: number } = {}
): QuickLinkPlan {
    const key = sourceKeyOf(design, sourceEntityId);
    const target = entityOf(design, targetEntityId);
    if (!key) return { ok: false, error: 'no-key' };
    if (!target) return { ok: false, error: 'no-field' };

    const commands: Command[] = [];
    let work = design;
    let columnId: Id;
    if (choice.kind === 'new') {
        const name = choice.name.trim();
        if (!name) return { ok: false, error: 'no-field' };
        const column = createColumn(design, target.columnIds.length, {
            name,
            type: counterpartType(key.type),
            length: key.length,
            precision: key.precision,
            scale: key.scale,
            now: options.now,
        });
        const insert: Command = {
            type: 'part.insert',
            entityId: targetEntityId,
            part: 'columns',
            item: column,
        };
        const next = apply(work, insert, { now: options.now });
        if (!next.ok) return { ok: false, error: 'no-field' };
        work = next.design;
        commands.push(insert);
        columnId = column.id;
    } else {
        columnId = choice.columnId;
    }
    const plan = planLink(
        work,
        { entityId: sourceEntityId, columnId: key.id },
        { entityId: targetEntityId, columnId },
        { now: options.now }
    );
    if (plan.kind === 'exists')
        return {
            ok: true,
            command: { type: 'group', commands },
            linkId: plan.link.id,
        };
    if (plan.kind !== 'ok') return { ok: false, error: 'no-link' };
    commands.push(plan.command);
    return {
        ok: true,
        command: { type: 'group', label: 'link', commands },
        linkId: plan.link.id,
    };
}

/** Runs a quick link: one undo step, then the new line is selected. */
export function commitQuickLink(
    store: EditorStore,
    sourceEntityId: Id,
    targetEntityId: Id,
    choice: TargetChoice
): QuickLinkPlan {
    const state = store.getState();
    const plan = planQuickLink(
        state.design,
        sourceEntityId,
        targetEntityId,
        choice
    );
    if (!plan.ok) return plan;
    const result = state.edit(plan.command);
    if (!result.ok) return { ok: false, error: 'no-link' };
    state.select([plan.linkId]);
    return plan;
}
