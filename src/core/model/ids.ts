/** The alphabet shared by every generated id. */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Length of the id given to every child record (tables, columns, keys ...). */
export const ID_LENGTH = 25;

/** A source of integers in [0, bound). Tests pass a seeded one. */
export type RandomInt = (bound: number) => number;

function webRandomInt(bound: number): number {
    const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
    if (cryptoObj?.getRandomValues) {
        // reject the top slice of the range so that every symbol is equally likely
        const limit = Math.floor(0x100000000 / bound) * bound;
        const buffer = new Uint32Array(1);
        for (;;) {
            cryptoObj.getRandomValues(buffer);
            if (buffer[0] < limit) return buffer[0] % bound;
        }
    }
    return Math.floor(Math.random() * bound);
}

/** A random string of `length` characters from `0-9a-z`. */
export function randomText(
    length: number,
    random: RandomInt = webRandomInt
): string {
    let text = '';
    for (let i = 0; i < length; i++) text += ALPHABET[random(ALPHABET.length)];
    return text;
}

/** A fresh opaque id for a child record. Callers must never parse it. */
export function newId(random?: RandomInt): string {
    return randomText(ID_LENGTH, random);
}

/**
 * A fresh id for a whole design. New designs use the same shape as every other
 * id (the per-browser prefix of older diagrams is not used for new ones; old
 * ids are opened unchanged).
 */
export function newDesignId(random?: RandomInt): string {
    return randomText(ID_LENGTH, random);
}

/** True when `id` has the shape that `newId` produces. */
export function looksLikeGeneratedId(id: string): boolean {
    return /^[0-9a-z]{25}$/.test(id);
}

/**
 * A stable id derived from a seed string. Used where a command must create a
 * record without calling a random source, so that applying it twice gives the
 * same result. Two different seeds practically never collide.
 */
export function idFromSeed(seed: string): string {
    // two independent 32-bit mixes, stretched to the id length
    let a = 0x811c9dc5;
    let b = 0x9e3779b1;
    for (let i = 0; i < seed.length; i++) {
        const c = seed.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193) >>> 0;
        b = Math.imul(b + c + i, 0x85ebca6b) >>> 0;
        b ^= b >>> 13;
    }
    let text = '';
    for (let i = 0; i < ID_LENGTH; i++) {
        a = (Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) + b) >>> 0;
        b = (Math.imul(b ^ (b >>> 12), 0x297a2d39) + a) >>> 0;
        text += ALPHABET[((a ^ b) >>> 0) % ALPHABET.length];
    }
    return text;
}

/** A seeded generator for tests: the same seed gives the same sequence. */
export function seededRandom(seed: number): RandomInt {
    let state = seed >>> 0 || 1;
    return (bound) => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state % bound;
    };
}
