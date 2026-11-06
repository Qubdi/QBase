import type { Cardinality } from '@/core/model/link';

export interface KeyColumnFacts {
    /** the column alone identifies a row (single primary key or unique) */
    identifiesRow: boolean;
}

/**
 * The two ends of a foreign key (IMP-022): `one` where the column identifies
 * a row, else `many`; a key always points at one row, so two `many` ends
 * become one/many (source one).
 */
export function cardinalityOf(
    referenced: KeyColumnFacts,
    holder: KeyColumnFacts
): { source: Cardinality; target: Cardinality } {
    const source: Cardinality = referenced.identifiesRow ? 'one' : 'many';
    const target: Cardinality = holder.identifiesRow ? 'one' : 'many';
    if (source === 'many' && target === 'many')
        return { source: 'one', target: 'many' };
    return { source, target };
}
