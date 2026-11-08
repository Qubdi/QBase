import { apply } from '@/core/commands/apply';
import type { Command } from '@/core/commands/command';
import { planMoveToArea } from './auto-arrange';
import type { Size } from '@/core/model/region-membership';
import type { Entity } from '@/core/model/entity';
import type { Id } from '@/core/model/id';
import { createRegion } from '@/core/model/defaults';
import { REGION_SIZE } from '@/core/model/region';
import type { EditorStore } from '@/store/editor-store';
import {
    addEntityAt,
    addNoteTo,
    addRegionAt,
    arrangeDiagram,
    deleteSelection,
    duplicateEntity,
    membersOf,
    moveToArea,
} from './canvas-actions';
import type { MenuAction } from './menu-model';

/** What a menu line may call on: the store, the camera and the surface. */
export interface MenuDeps {
    store: EditorStore;
    measure(entity: Entity): Size;
    visibleSchemas?: readonly string[];
    /** ids of the tables that are drawn, for Auto Arrange */
    drawn: ReadonlySet<Id>;
    openLinkDialog?(): void;
    startEditing(id: Id): void;
    startRename(id: Id): void;
    beginLink(id: Id): void;
    /** opens the confirm box of Auto Arrange */
    askArrange(): void;
}

/**
 * Creates an area at the point and moves the tables into it, as one undo step
 * (the "New Area" line of Move to Area, EDT-056).
 */
export function moveToNewArea(
    store: EditorStore,
    ids: readonly Id[],
    at: { x: number; y: number },
    measure: (entity: Entity) => Size
): boolean {
    const state = store.getState();
    const region = createRegion(state.design, {
        box: { x: Math.round(at.x), y: Math.round(at.y), ...REGION_SIZE },
    });
    const insert: Command = {
        type: 'item.insert',
        collection: 'regions',
        item: region,
    };
    const scratch = apply(state.design, insert, { now: 0 });
    if (!scratch.ok) return false;
    const move = planMoveToArea(scratch.design, ids, region.id, measure);
    const result = state.edit({
        type: 'group',
        label: 'move to new area',
        commands: move ? [insert, move] : [insert],
    });
    return result.ok;
}

/** Runs the action of a picked menu line. */
export function runMenuAction(action: MenuAction, deps: MenuDeps): void {
    const { store } = deps;
    switch (action.type) {
        case 'new-entity': {
            const id = addEntityAt(
                store,
                action.kind,
                action.at,
                deps.visibleSchemas,
                deps.measure
            );
            if (id) deps.startEditing(id);
            return;
        }
        case 'new-link-dialog':
            deps.openLinkDialog?.();
            return;
        case 'new-region':
            addRegionAt(store, action.at);
            return;
        case 'new-note':
            addNoteTo(store, action.anchor);
            return;
        case 'arrange-all':
            deps.askArrange();
            return;
        case 'move-to-area':
            moveToArea(store, action.ids, action.regionId, deps.measure);
            return;
        case 'move-to-new-area':
            moveToNewArea(store, action.ids, action.at, deps.measure);
            return;
        case 'edit-entity':
            deps.startEditing(action.id);
            return;
        case 'duplicate-entity':
            duplicateEntity(store, action.id, deps.measure);
            return;
        case 'draw-link':
            deps.beginLink(action.id);
            return;
        case 'delete-entities':
            store.getState().select(action.ids);
            deleteSelection(store);
            return;
        case 'rename-region':
            deps.startRename(action.id);
            return;
        case 'arrange-region': {
            const members = membersOf(store.getState().design, action.id);
            arrangeDiagram(
                store,
                {
                    ids: new Set(members.filter((id) => deps.drawn.has(id))),
                    regionId: action.id,
                },
                deps.measure
            );
            return;
        }
        case 'delete-region':
            store.getState().select([action.id]);
            deleteSelection(store);
            return;
    }
}
