import type { Design } from '@/core/model/design';
import type { EntityKind } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import type { MemoAnchor } from '@/core/model/memo';
import type { Point } from './flow-model';

/** What picking a menu line does. The canvas runs these (see `menu-actions.ts`). */
export type MenuAction =
    | { type: 'new-entity'; kind: EntityKind; at: Point }
    | { type: 'new-link-dialog' }
    | { type: 'new-region'; at: Point }
    | { type: 'new-note'; anchor: MemoAnchor }
    | { type: 'arrange-all' }
    | { type: 'move-to-area'; ids: Id[]; regionId: Id | undefined }
    | { type: 'move-to-new-area'; ids: Id[]; at: Point }
    | { type: 'edit-entity'; id: Id }
    | { type: 'duplicate-entity'; id: Id }
    | { type: 'draw-link'; id: Id }
    | { type: 'delete-entities'; ids: Id[] }
    | { type: 'rename-region'; id: Id }
    | { type: 'arrange-region'; id: Id }
    | { type: 'delete-region'; id: Id };

/** One line of a menu. `label` is an i18n key under `canvas.menu`, with its values. */
export type MenuLine =
    | { kind: 'separator' }
    | {
          kind: 'item';
          label: string;
          /** values for the label, such as a count */
          values?: Record<string, unknown>;
          /** shown as written, not translated (an area's own name) */
          verbatim?: string;
          disabled?: boolean;
          action?: MenuAction;
          submenu?: MenuLine[];
      };

export type MenuTarget =
    | { kind: 'pane' }
    /** `columnId`: the field row that was clicked, when it was a row and not the table's title */
    | { kind: 'entity'; id: Id; columnId?: Id }
    | { kind: 'region'; id: Id }
    | { kind: 'memo'; id: Id };

export interface MenuContext {
    design: Design;
    selection: readonly Id[];
    target: MenuTarget;
    /** where the pointer was, in canvas coordinates */
    at: Point;
    /** views are offered while they are drawn */
    showViews: boolean;
    /** the workspace can open the Create Relationship dialog */
    canOpenLinkDialog: boolean;
    /** the workspace can edit a table in place */
    canEditEntity: boolean;
}

const item = (
    label: string,
    action: MenuAction | undefined,
    extra: Partial<Extract<MenuLine, { kind: 'item' }>> = {}
): MenuLine => ({ kind: 'item', label, action, ...extra });

const SEPARATOR: MenuLine = { kind: 'separator' };

function areaChoices(
    design: Design,
    ids: Id[],
    at: Point,
    offerNone: boolean
): MenuLine[] {
    const lines: MenuLine[] = [];
    if (offerNone) {
        const anyInArea = ids.some(
            (id) => design.entities.byId[id]?.regionId !== undefined
        );
        lines.push(
            item(
                'noArea',
                { type: 'move-to-area', ids, regionId: undefined },
                { disabled: !anyInArea }
            )
        );
    }
    for (const regionId of design.regions.order)
        lines.push(
            item(
                'moveToArea',
                { type: 'move-to-area', ids, regionId },
                { verbatim: design.regions.byId[regionId].label }
            )
        );
    lines.push(item('newArea', { type: 'move-to-new-area', ids, at }));
    return lines;
}

/** The entities a table menu acts on: the whole selection if the table is in it. */
export function menuTargets(
    design: Design,
    selection: readonly Id[],
    clicked: Id
): Id[] {
    const picked = design.entities.order.filter((id) => selection.includes(id));
    return picked.includes(clicked) ? picked : [clicked];
}

/** The lines of the right-click menu for a target (EDT-054 to EDT-060). */
export function buildMenu(context: MenuContext): MenuLine[] {
    const { design, selection, target, at } = context;

    if (target.kind === 'pane') {
        const lines: MenuLine[] = [
            item('newTable', { type: 'new-entity', kind: 'table', at }),
        ];
        if (context.showViews)
            lines.push(
                item('newView', { type: 'new-entity', kind: 'view', at })
            );
        if (context.canOpenLinkDialog)
            lines.push(item('newRelationship', { type: 'new-link-dialog' }));
        lines.push(
            item('newArea', { type: 'new-region', at }),
            SEPARATOR,
            item('arrange', { type: 'arrange-all' })
        );
        const picked = design.entities.order.filter((id) =>
            selection.includes(id)
        );
        if (picked.length > 0)
            lines.push(
                SEPARATOR,
                item('moveToAreaCount', undefined, {
                    values: { count: picked.length },
                    submenu: areaChoices(design, picked, at, false),
                })
            );
        return lines;
    }

    if (target.kind === 'entity') {
        const ids = menuTargets(design, selection, target.id);
        const entity = design.entities.byId[target.id];
        const lines: MenuLine[] = [];
        // a click on a field row adds the note to that field; on the title, to the table
        const column =
            target.columnId && entity?.columnIds.includes(target.columnId)
                ? target.columnId
                : undefined;
        if (context.canEditEntity)
            lines.push(
                item('editTable', { type: 'edit-entity', id: target.id })
            );
        lines.push(
            item('duplicateTable', { type: 'duplicate-entity', id: target.id }),
            column
                ? item('addFieldNote', {
                      type: 'new-note',
                      anchor: { kind: 'column', id: column },
                  })
                : item('addNote', {
                      type: 'new-note',
                      anchor: { kind: 'entity', id: target.id },
                  })
        );
        if (entity?.kind === 'table')
            lines.push(
                item('addRelationship', { type: 'draw-link', id: target.id })
            );
        lines.push(
            ids.length > 1
                ? item('moveToAreaCount', undefined, {
                      values: { count: ids.length },
                      submenu: areaChoices(design, ids, at, true),
                  })
                : item('moveToArea', undefined, {
                      submenu: areaChoices(design, ids, at, true),
                  }),
            ids.length > 1
                ? item(
                      'deleteTables',
                      { type: 'delete-entities', ids },
                      { values: { count: ids.length } }
                  )
                : item('deleteTable', { type: 'delete-entities', ids })
        );
        return lines;
    }

    if (target.kind === 'region')
        return [
            item('editAreaName', { type: 'rename-region', id: target.id }),
            item('addNote', {
                type: 'new-note',
                anchor: { kind: 'region', id: target.id },
            }),
            item('arrangeArea', { type: 'arrange-region', id: target.id }),
            item('deleteArea', { type: 'delete-region', id: target.id }),
        ];

    return [];
}
