import { listOf } from './collection';
import type { Design } from './design';
import type { Id } from './id';
import type { MemoAnchor } from './memo';
import { estimatedSize } from './region-membership';

/** How far a point is from a box (0 when it is inside). */
function distance(
    x: number,
    y: number,
    box: { x: number; y: number; width: number; height: number }
): number {
    const dx = Math.max(box.x - x, 0, x - (box.x + box.width));
    const dy = Math.max(box.y - y, 0, y - (box.y + box.height));
    return Math.hypot(dx, dy);
}

/**
 * The area the point is in (the smallest, when several), else the nearest
 * table; undefined when the design has neither.
 */
export function nearestOwner(
    design: Design,
    x: number,
    y: number
): MemoAnchor | undefined {
    let area: { id: Id; size: number } | undefined;
    for (const region of listOf(design.regions)) {
        const { box } = region;
        if (distance(x, y, box) > 0) continue;
        const size = box.width * box.height;
        if (!area || size < area.size) area = { id: region.id, size };
    }
    if (area) return { kind: 'region', id: area.id };
    let best: { id: Id; far: number } | undefined;
    for (const entity of listOf(design.entities)) {
        const size = estimatedSize(entity);
        const far = distance(x, y, { x: entity.x, y: entity.y, ...size });
        if (!best || far < best.far) best = { id: entity.id, far };
    }
    return best ? { kind: 'entity', id: best.id } : undefined;
}

/**
 * What a note is attached to when nothing was chosen: a selected table, else a
 * selected area, else undefined.
 */
export function ownerFromSelection(
    design: Design,
    selection: readonly Id[]
): MemoAnchor | undefined {
    const table = selection.find((id) => design.entities.byId[id]);
    if (table) return { kind: 'entity', id: table };
    const area = selection.find((id) => design.regions.byId[id]);
    return area ? { kind: 'region', id: area } : undefined;
}

/** A readable name for what a note is attached to: an area's label, a table's name, `table.column`. */
export function ownerName(design: Design, anchor: MemoAnchor): string {
    if (anchor.kind === 'region')
        return design.regions.byId[anchor.id]?.label ?? '';
    if (anchor.kind === 'entity')
        return design.entities.byId[anchor.id]?.name ?? '';
    for (const id of design.entities.order) {
        const entity = design.entities.byId[id];
        if (entity.columnIds.includes(anchor.id))
            return `${entity.name}.${design.columns[anchor.id]?.name ?? ''}`;
    }
    return '';
}
