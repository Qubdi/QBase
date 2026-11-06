/**
 * Row-level steps of the old database upgrades (data-format 2.3), as plain
 * functions so the Dexie upgrade and the tests share them.
 */

type Row = Record<string, unknown>;

/** v2 and v9: a text type becomes {id, name}; text nullable becomes a boolean. */
export function upgradeLegacyField(field: unknown): unknown {
    if (typeof field !== 'object' || field === null) return field;
    const copy: Row = { ...(field as Row) };
    if (typeof copy.type === 'string')
        copy.type = { id: copy.type.replace(/ /g, '_'), name: copy.type };
    if (typeof copy.nullable === 'string')
        copy.nullable = copy.nullable.toLowerCase() === 'true';
    return copy;
}

const CARDINALITIES: Record<string, ['one' | 'many', 'one' | 'many']> = {
    one_to_one: ['one', 'one'],
    one_to_many: ['one', 'many'],
    many_to_one: ['many', 'one'],
    many_to_many: ['one', 'many'],
};

/** v6: the relationship `type` text becomes two cardinalities (missing counts as one_to_one). */
export function upgradeLegacyRelationship(rel: Row): Row {
    const [source, target] =
        CARDINALITIES[typeof rel.type === 'string' ? rel.type : ''] ??
        CARDINALITIES.one_to_one;
    return {
        ...rel,
        sourceCardinality: rel.sourceCardinality ?? source,
        targetCardinality: rel.targetCardinality ?? target,
    };
}
