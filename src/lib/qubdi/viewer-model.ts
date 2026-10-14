// Turns a published diagram (untrusted JSON from the server) into what the
// read-only viewer draws. Pure and defensive: malformed input never throws.

export interface ViewerField {
    id: string;
    name: string;
    type: string;
    primaryKey: boolean;
    nullable: boolean;
    unique: boolean;
}

export interface ViewerTable {
    id: string;
    name: string;
    schema: string | null;
    x: number;
    y: number;
    color: string;
    isView: boolean;
    fields: ViewerField[];
}

export interface ViewerEdge {
    id: string;
    source: string;
    target: string;
    label: string;
}

export interface ViewerGraph {
    tables: ViewerTable[];
    edges: ViewerEdge[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' ? v : fallback;
const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const DEFAULT_COLOR = '#8eb7ff';
const GRID_COLUMNS = 4;
const GRID_STEP_X = 320;
const GRID_STEP_Y = 360;

export function buildViewerGraph(content: unknown): ViewerGraph {
    if (!isRecord(content)) return { tables: [], edges: [] };

    const tables: ViewerTable[] = [];
    arr(content.tables).forEach((raw, index) => {
        if (!isRecord(raw) || typeof raw.id !== 'string') return;
        const fields: ViewerField[] = [];
        for (const f of arr(raw.fields)) {
            if (!isRecord(f) || typeof f.id !== 'string') continue;
            fields.push({
                id: f.id,
                name: str(f.name),
                type: isRecord(f.type) ? str(f.type.name) : '',
                primaryKey: f.primaryKey === true,
                nullable: f.nullable !== false,
                unique: f.unique === true,
            });
        }
        tables.push({
            id: raw.id,
            name: str(raw.name, 'unnamed'),
            schema: typeof raw.schema === 'string' ? raw.schema : null,
            // tables without coordinates get a readable grid position
            x: num(raw.x, (index % GRID_COLUMNS) * GRID_STEP_X),
            y: num(raw.y, Math.floor(index / GRID_COLUMNS) * GRID_STEP_Y),
            color: str(raw.color, DEFAULT_COLOR),
            isView: raw.isView === true,
            fields,
        });
    });

    const known = new Set(tables.map((t) => t.id));
    const edges: ViewerEdge[] = [];
    for (const raw of arr(content.relationships)) {
        if (!isRecord(raw)) continue;
        const source = str(raw.sourceTableId);
        const target = str(raw.targetTableId);
        if (!known.has(source) || !known.has(target)) continue;
        edges.push({
            id: str(raw.id, `${source}->${target}`),
            source,
            target,
            label: str(raw.name),
        });
    }

    return { tables, edges };
}

/**
 * Tables matching a search, by table name, schema or field name.
 * Returns null for an empty query, meaning "no filter".
 */
export function searchTables(
    tables: ViewerTable[],
    query: string
): Set<string> | null {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hits = new Set<string>();
    for (const t of tables) {
        const inTable =
            t.name.toLowerCase().includes(q) ||
            (t.schema ?? '').toLowerCase().includes(q);
        if (inTable || t.fields.some((f) => f.name.toLowerCase().includes(q))) {
            hits.add(t.id);
        }
    }
    return hits;
}

/** The table plus every table directly related to it. */
export function relatedTableIds(
    edges: ViewerEdge[],
    tableId: string
): Set<string> {
    const ids = new Set<string>([tableId]);
    for (const e of edges) {
        if (e.source === tableId) ids.add(e.target);
        if (e.target === tableId) ids.add(e.source);
    }
    return ids;
}

export const edgeTouches = (e: ViewerEdge, tableId: string): boolean =>
    e.source === tableId || e.target === tableId;

export const buildShareUrl = (origin: string, token: string): string =>
    `${origin.replace(/\/$/, '')}/s/${token}`;
