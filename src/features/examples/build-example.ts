import { apply } from '@/core/commands/apply';
import type { Command } from '@/core/commands/command';
import { planUpdateColumn } from '@/core/commands/plan-column';
import { planAddMemo, planAddRegion } from '@/core/commands/plan-visual';
import { REGION_COLORS } from '@/core/model/defaults';
import type { Design } from '@/core/model/design';
import { COLLAPSED_COLUMNS, TABLE_WIDTH } from '@/core/model/entity';
import { analyzeImport } from '@/features/import/analyze-import';
import { parseColumn } from './spec';
import type { Domain, TableSpec } from './spec';
import { writeScript } from './write-script';

const COLUMN_GAP = 64;
const ROW_GAP = 56;
const AREA_PAD = 56;
const AREA_TITLE = 48;
const NOTE = { width: 240, height: 150, gap: 20, room: 190 };
const ROW_WIDTH = 2800;
const AREA_GAP = 96;

/** How tall the card of a table is on the canvas: header, rows, and the Show More bar. */
export function cardHeight(columns: number): number {
    const rows = Math.min(columns, COLLAPSED_COLUMNS);
    return 48 + 32 * rows + (columns > COLLAPSED_COLUMNS ? 32 : 0) + 4;
}

interface Place {
    table: TableSpec;
    x: number;
    y: number;
}
interface Block {
    area: string;
    width: number;
    height: number;
    notes: number;
    places: Place[];
}

/** One area: its tables in a grid, with room above for its notes. */
function layoutArea(domain: Domain, areaId: string): Block {
    const tables = domain.tables.filter((t) => t.area === areaId);
    const notes = domain.notes.filter((n) => n.area === areaId).length;
    const perRow = tables.length <= 4 ? 2 : tables.length <= 9 ? 3 : 4;
    const places: Place[] = [];
    let y = AREA_TITLE;
    for (let i = 0; i < tables.length; i += perRow) {
        const row = tables.slice(i, i + perRow);
        const tall = Math.max(...row.map((t) => cardHeight(t.columns.length)));
        row.forEach((table, k) =>
            places.push({
                table,
                x: AREA_PAD + k * (TABLE_WIDTH.default + COLUMN_GAP),
                y,
            })
        );
        y += tall + ROW_GAP;
    }
    const used = Math.min(perRow, Math.max(tables.length, 1));
    return {
        area: areaId,
        width:
            2 * AREA_PAD + used * TABLE_WIDTH.default + (used - 1) * COLUMN_GAP,
        height: y - ROW_GAP + AREA_PAD,
        notes,
        places,
    };
}

const must = (design: Design, command: Command): Design => {
    const result = apply(design, command, { now: Date.now() });
    if (!result.ok) throw new Error(`example: ${JSON.stringify(result)}`);
    return result.design as Design;
};

/** The words of the domain's example as a finished diagram, or why it could not be made. */
export async function buildExample(
    domain: Domain
): Promise<{ design: Design } | { problem: string }> {
    const result = await analyzeImport(writeScript(domain), {
        method: 'sql',
        databaseType: domain.databaseType,
        diagramName: domain.name,
    });
    if (!result.design || result.blocked)
        return {
            problem:
                result.diagnostics
                    .filter((d) => d.severity === 'error')
                    .map((d) => d.message)
                    .join('; ') || 'nothing to import',
        };
    let design = result.design;
    const byName = new Map(
        design.entities.order.map((id) => [
            design.entities.byId[id].name,
            design.entities.byId[id],
        ])
    );

    // where each area goes: left to right, a new row when the row is full
    const blocks = domain.areas.map((a) => layoutArea(domain, a.id));
    let x = 0;
    let rowTop = 0;
    let rowHigh = 0;
    const origin = new Map<string, { x: number; y: number; block: Block }>();
    for (const block of blocks) {
        if (x > 0 && x + block.width > ROW_WIDTH) {
            x = 0;
            rowTop += rowHigh + AREA_GAP;
            rowHigh = 0;
        }
        const top = rowTop + (block.notes > 0 ? NOTE.room : 0);
        origin.set(block.area, { x, y: top, block });
        rowHigh = Math.max(
            rowHigh,
            block.height + (block.notes > 0 ? NOTE.room : 0)
        );
        x += block.width + AREA_GAP;
    }

    for (const area of domain.areas) {
        const at = origin.get(area.id)!;
        const color = REGION_COLORS[area.tone % REGION_COLORS.length];
        const addRegion = planAddRegion(design, {
            label: area.label,
            tint: color,
            box: {
                x: at.x,
                y: at.y,
                width: at.block.width,
                height: at.block.height,
            },
        });
        if (addRegion.type !== 'item.insert') throw new Error('no region');
        const regionId = addRegion.item.id;
        design = must(design, addRegion);
        for (const place of at.block.places) {
            const entity = byName.get(place.table.name);
            if (!entity) throw new Error(`no table ${place.table.name}`);
            design = must(design, {
                type: 'entity.update',
                id: entity.id,
                patch: {
                    x: at.x + place.x,
                    y: at.y + place.y,
                    color,
                    regionId,
                    comments: place.table.about,
                },
            });
        }
        let k = 0;
        for (const note of domain.notes.filter((n) => n.area === area.id)) {
            design = must(
                design,
                planAddMemo({
                    body: note.text,
                    box: {
                        x: at.x + k * (NOTE.width + NOTE.gap),
                        y: at.y - NOTE.room + 20,
                        width: NOTE.width,
                        height: NOTE.height,
                    },
                })
            );
            k++;
        }
    }

    // the descriptions of the columns
    for (const table of domain.tables) {
        const entity = design.entities.byId[byName.get(table.name)!.id];
        for (const source of table.columns) {
            const parsed = parseColumn(source);
            if (!parsed.about) continue;
            const column = entity.columnIds
                .map((id) => design.columns[id])
                .find((c) => c.name === parsed.name);
            if (!column)
                throw new Error(`no column ${table.name}.${parsed.name}`);
            design = must(
                design,
                planUpdateColumn(entity.id, column.id, {
                    comments: parsed.about,
                })
            );
        }
    }
    return { design };
}
