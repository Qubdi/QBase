import { isRecord } from './record-reader';
import type { RawRecord } from './record-reader';
import { CURRENT_VERSION, VERSION_KEY } from './version';
import type { WireWarning } from './warning';

export const COLLECTION_KEYS = [
    'tables',
    'relationships',
    'dependencies',
    'areas',
    'customTypes',
    'notes',
] as const;

export interface UpgradeResult {
    json: RawRecord;
    /** the version the input had (1 when the key was missing) */
    fromVersion: number;
    warnings: WireWarning[];
}

/** One-to-one and friends: how the old relationship `type` text maps (data-format 2.3 v6). */
const LEGACY_TYPES: Record<string, ['one' | 'many', 'one' | 'many']> = {
    one_to_one: ['one', 'one'],
    one_to_many: ['one', 'many'],
    many_to_one: ['many', 'one'],
    many_to_many: ['one', 'many'],
};

export function typeRefFromText(text: string): { id: string; name: string } {
    return { id: text.replace(/ /g, '_'), name: text };
}

/**
 * Brings the JSON of any older shape up to the current one: field `type` as
 * plain text, `nullable` as text, relationship `type` instead of two
 * cardinalities, both cardinalities `many`, missing collections, a stray
 * `diagramId` on child rows. Works on a copy; the input is never changed.
 * Everything it does is also correct for current-shape input (no-op).
 */
export function upgrade(input: unknown): UpgradeResult {
    if (!isRecord(input)) throw new Error('A diagram must be a JSON object');
    const warnings: WireWarning[] = [];
    const json: RawRecord = { ...input };

    const version =
        typeof json[VERSION_KEY] === 'number'
            ? (json[VERSION_KEY] as number)
            : 1;
    if (version > CURRENT_VERSION) {
        warnings.push({
            path: VERSION_KEY,
            message: `file format ${version} is newer than this editor (${CURRENT_VERSION}); unknown parts are kept`,
        });
    }

    for (const key of COLLECTION_KEYS) {
        const value = json[key];
        json[key] = Array.isArray(value)
            ? value.map((row) => stripDiagramId(row))
            : [];
    }

    json.tables = (json.tables as unknown[]).map((table) =>
        upgradeTable(table)
    );
    json.relationships = (json.relationships as unknown[]).map((rel, i) =>
        upgradeRelationship(rel, `relationships[${i}]`, warnings)
    );
    return { json, fromVersion: version, warnings };
}

function stripDiagramId(row: unknown): unknown {
    if (!isRecord(row) || !('diagramId' in row)) return row;
    const copy = { ...row };
    delete copy.diagramId;
    return copy;
}

function upgradeTable(table: unknown): unknown {
    if (!isRecord(table)) return table;
    const copy: RawRecord = { ...table };
    if (Array.isArray(copy.fields)) {
        copy.fields = copy.fields.map((field) => upgradeField(field));
    }
    return copy;
}

function upgradeField(field: unknown): unknown {
    if (!isRecord(field)) return field;
    const copy: RawRecord = { ...field };
    if (typeof copy.type === 'string') copy.type = typeRefFromText(copy.type);
    if (typeof copy.nullable === 'string')
        copy.nullable = copy.nullable.toLowerCase() === 'true';
    return copy;
}

function upgradeRelationship(
    rel: unknown,
    path: string,
    warnings: WireWarning[]
): unknown {
    if (!isRecord(rel)) return rel;
    const copy: RawRecord = { ...rel };
    const hasCardinality =
        copy.sourceCardinality != null || copy.targetCardinality != null;
    if (typeof copy.type === 'string' || !hasCardinality) {
        const [source, target] =
            LEGACY_TYPES[typeof copy.type === 'string' ? copy.type : ''] ??
            LEGACY_TYPES.one_to_one;
        if (!hasCardinality) {
            copy.sourceCardinality = source;
            copy.targetCardinality = target;
        }
        delete copy.type;
    }
    if (
        copy.sourceCardinality === 'many' &&
        copy.targetCardinality === 'many'
    ) {
        copy.sourceCardinality = 'one';
        warnings.push({
            path,
            message: 'many to many does not exist; changed to one to many',
        });
    }
    return copy;
}
