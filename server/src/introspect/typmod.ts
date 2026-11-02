/**
 * PostgreSQL stores type parameters (length, precision, scale) in one integer,
 * atttypmod. This decodes it for the types where it means something.
 */
export interface DecodedTypmod {
    characterMaximumLength: string | null;
    precision: { precision: number | null; scale: number | null } | null;
}

const VARLEN = new Set([
    'character varying',
    'character',
    'bit',
    'bit varying',
    'varchar',
    'bpchar',
    'char',
    'varbit',
]);
const TIME_LIKE = new Set([
    'timestamp without time zone',
    'timestamp with time zone',
    'time without time zone',
    'time with time zone',
    'interval',
    'timestamp',
    'timestamptz',
    'time',
    'timetz',
]);

const VARHDRSZ = 4;

export function decodeTypmod(type: string, typmod: number): DecodedTypmod {
    const none: DecodedTypmod = { characterMaximumLength: null, precision: null };
    if (typmod < 0) return none;
    const base = type.replace(/\[\]$/, '').toLowerCase();

    if (VARLEN.has(base)) {
        // bit types store the length directly; character types add a 4 byte header
        const isBit = base.startsWith('bit') || base === 'varbit';
        const len = isBit ? typmod : typmod - VARHDRSZ;
        return {
            characterMaximumLength: len > 0 ? String(len) : null,
            precision: null,
        };
    }
    if (base === 'numeric' || base === 'decimal') {
        const m = typmod - VARHDRSZ;
        if (m < 0) return none;
        return {
            characterMaximumLength: null,
            precision: { precision: (m >> 16) & 0xffff, scale: m & 0xffff },
        };
    }
    if (TIME_LIKE.has(base)) {
        // interval typmod packs a field mask in the high bits; precision is the low 16
        const p = base === 'interval' ? typmod & 0xffff : typmod;
        return {
            characterMaximumLength: null,
            precision: p === 0xffff ? null : { precision: p, scale: null },
        };
    }
    return none;
}

/** "integer[]" -> { base: "integer", isArray: true } */
export function splitArrayType(type: string): { base: string; isArray: boolean } {
    return type.endsWith('[]')
        ? { base: type.replace(/(\[\])+$/, ''), isArray: true }
        : { base: type, isArray: false };
}
