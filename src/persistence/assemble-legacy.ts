import type { RawRecord } from '../core/wire/record-reader';

type Row = Record<string, unknown>;

/** Rows of one diagram read from the old stores. */
export interface LegacyRows {
    diagram: Row;
    tables: Row[];
    relationships: Row[];
    dependencies: Row[];
    areas: Row[];
    customTypes: Row[];
    notes: Row[];
}

function plain(value: unknown): unknown {
    return value instanceof Date ? value.toISOString() : value;
}

function byName(a: Row, b: Row): number {
    return String(a.name ?? '').localeCompare(String(b.name ?? ''));
}

/**
 * Joins the old rows of one diagram back into the diagram JSON. Nothing is
 * dropped: unknown keys stay for the tolerant parse to keep. Relationships and
 * custom types are put in the alphabetical order the old editor showed them
 * in, so the person sees the same list after the move (the order is then kept
 * explicitly).
 */
export function assembleLegacyDiagram(rows: LegacyRows): RawRecord {
    const diagram: Row = { ...rows.diagram };
    for (const key of ['createdAt', 'updatedAt']) {
        if (key in diagram) diagram[key] = plain(diagram[key]);
    }
    return {
        ...diagram,
        tables: rows.tables,
        relationships: [...rows.relationships].sort(byName),
        dependencies: rows.dependencies,
        areas: rows.areas,
        customTypes: [...rows.customTypes].sort(byName),
        notes: rows.notes,
    };
}
