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
        // PostgreSQL 15 allows a negative scale: the scale is an 11 bit signed
        // number in the low bits, so its sign must be extended
        const rawScale = m & 0x7ff;
        const scale = rawScale & 0x400 ? rawScale - 0x800 : rawScale;
        return {
            characterMaximumLength: null,
            precision: { precision: (m >> 16) & 0xffff, scale },
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
    if (!type.endsWith('[]')) return { base: type, isArray: false };
    // a loop, not /(\[\])+$/: that regex is quadratic on a long text of "[][]..."
    let end = type.length;
    while (end >= 2 && type.startsWith('[]', end - 2)) end -= 2;
    return { base: type.slice(0, end), isArray: true };
}
