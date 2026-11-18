import { createMemo, createRegion, createUserType } from '../model/defaults';
import type { Design } from '../model/design';
import type { Entity } from '../model/entity';
import type { Id } from '../model/id';
import { entityList } from '../model/lookup';
import { anchorPoint, firstOffset, MEMO_SIZE } from '../model/memo';
import type { Point } from '../model/memo';
import type { Memo, MemoAnchor } from '../model/memo';
import type { Region } from '../model/region';
import { regionMembership } from '../model/region-membership';
import type { Size } from '../model/region-membership';
import type { UserType, UserTypeKind } from '../model/user-type';
import type { Command } from './command';
import type { PlanOptions } from './plan-entity';

export function planAddRegion(
    design: Design,
    options: PlanOptions & Partial<Region> = {}
): Command {
    return {
        type: 'item.insert',
        collection: 'regions',
        item: createRegion(design, options),
    };
}

export function planAddMemo(
    options: PlanOptions & Partial<Memo> = {}
): Command {
    return {
        type: 'item.insert',
        collection: 'memos',
        item: createMemo(options),
    };
}

/**
 * A new note attached to an area, a table or a column, placed to the right of
 * it; it moves with it from then on.
 */
export function planAddNote(
    design: Design,
    anchor: MemoAnchor,
    options: PlanOptions & Partial<Memo> & { at?: Point } = {}
): Command {
    const { at, ...rest } = options;
    const origin = at ? anchorPoint(design, anchor) : undefined;
    const offset =
        at && origin
            ? { x: at.x - origin.x, y: at.y - origin.y }
            : firstOffset(design, anchor);
    return planAddMemo({
        ...rest,
        anchor,
        box: {
            x: offset.x,
            y: offset.y,
            width: options.box?.width ?? MEMO_SIZE.width,
            height: options.box?.height ?? MEMO_SIZE.height,
        },
    });
}

export function planAddUserType(
    design: Design,
    options: PlanOptions & Partial<UserType> = {}
): Command {
    return {
        type: 'item.insert',
        collection: 'userTypes',
        item: createUserType(design, options),
    };
}

/**
 * Switches an enum to a composite or back, clearing the data of the kind that
 * is left (EDT-194 change) and starting the new kind empty.
 */
export function planSetUserTypeKind(id: Id, kind: UserTypeKind): Command {
    return {
        type: 'item.update',
        collection: 'userTypes',
        id,
        patch:
            kind === 'enum'
                ? { kind, values: [], members: undefined, base: undefined }
                : kind === 'composite'
                  ? { kind, members: [], values: undefined, base: undefined }
                  : { kind, base: '', values: undefined, members: undefined },
    };
}

/**
 * Membership of entities in regions follows geometry (editor 10.3). Returns
 * the updates that bring `regionId` in line, or undefined when all agree.
 */
export function planMembership(
    design: Design,
    measure?: (entity: Entity) => Size
): Command | undefined {
    const wanted = regionMembership(design, measure);
    const commands: Command[] = [];
    for (const entity of entityList(design)) {
        const regionId = wanted.get(entity.id);
        if (entity.regionId !== regionId)
            commands.push({
                type: 'entity.update',
                id: entity.id,
                patch: { regionId },
            });
    }
    return commands.length === 0
        ? undefined
        : { type: 'group', commands, label: 'membership' };
}

/**
 * Drags a region: it and the tables that belong to it move by the same amount,
 * as one step (EDT-037).
 */
export function planMoveRegion(
    design: Design,
    regionId: Id,
    x: number,
    y: number
): Command | undefined {
    const region = design.regions.byId[regionId];
    if (!region) return undefined;
    const dx = x - region.box.x;
    const dy = y - region.box.y;
    const members = entityList(design).filter((e) => e.regionId === regionId);
    return {
        type: 'group',
        label: 'move region',
        commands: [
            {
                type: 'item.update',
                collection: 'regions',
                id: regionId,
                patch: { box: { ...region.box, x, y } },
            },
            {
                type: 'entity.move',
                moves: members.map((e) => ({
                    id: e.id,
                    x: e.x + dx,
                    y: e.y + dy,
                })),
            },
        ],
    };
}
