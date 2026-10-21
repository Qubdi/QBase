import {
    createHash,
    createHmac,
    randomBytes,
    randomInt,
    timingSafeEqual,
} from 'node:crypto';

// Authenticator-app codes, RFC 6238 (TOTP) on RFC 4226 (HOTP): HMAC-SHA1, six
// digits, 30-second steps. That is what Google Authenticator, Microsoft
// Authenticator, Authy and 1Password all calculate, so any of them works.
// Nothing here talks to a network: a code is a function of the shared secret
// and the clock. Pure functions, so they are tested against the RFC's vectors.

export const STEP_SECONDS = 30;
export const CODE_DIGITS = 6;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
        // keep only the bits not written yet, so the number never grows
        value &= (1 << bits) - 1;
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

/** Reads base32 the way people type it: any case, spaces and dashes ignored. */
export function base32Decode(text: string): Buffer {
    const clean = text.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const idx = B32.indexOf(ch);
        if (idx < 0) throw new Error('Not base32');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
            value &= (1 << bits) - 1;
        }
    }
    return Buffer.from(out);
}

/** A new shared secret: 160 bits, the size RFC 4226 recommends. */
export function generateSecret(): string {
    return base32Encode(randomBytes(20));
}

/** The address a QR code carries; the app adds the account from it. */
export function otpauthUrl(options: {
    secret: string;
    account: string;
    issuer: string;
}): string {
    const label = `${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.account)}`;
    const query = new URLSearchParams({
        secret: options.secret,
        issuer: options.issuer,
        algorithm: 'SHA1',
        digits: String(CODE_DIGITS),
        period: String(STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${query.toString()}`;
}

export function hotp(key: Buffer, counter: number, digits = CODE_DIGITS): string {
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(counter));
    const mac = createHmac('sha1', key).update(msg).digest();
    const offset = mac[mac.length - 1] & 0x0f;
    const bin =
        ((mac[offset] & 0x7f) << 24) |
        (mac[offset + 1] << 16) |
        (mac[offset + 2] << 8) |
        mac[offset + 3];
    return String(bin % 10 ** digits).padStart(digits, '0');
}

/** Which 30-second step a moment (milliseconds) falls in. */
export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

export function totp(
    secret: string,
    ms = Date.now(),
    digits = CODE_DIGITS
): string {
    return hotp(base32Decode(secret), stepAt(ms), digits);
}

const same = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a typed code against the steps from `windowSteps` before now to
 * `windowSteps` after it (clock drift), comparing in constant time. A step
 * that is not newer than `lastStep` is refused, so a code that was already
 * used (or shown over someone's shoulder) cannot be used again. Returns the
 * step that matched, to store as the new `lastStep`.
 */
export function verifyTotp(options: {
    secret: string;
    code: string;
    now?: number;
    windowSteps: number;
    lastStep?: number | null;
}): { ok: true; step: number } | { ok: false } {
    const code = options.code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) return { ok: false };
    const key = base32Decode(options.secret);
    const current = stepAt(options.now ?? Date.now());
    const last = options.lastStep ?? -1;
    let hit: number | null = null;
    // every step is compared, so the time taken does not say which one matched
    for (let d = -options.windowSteps; d <= options.windowSteps; d++) {
        const step = current + d;
        if (same(hotp(key, step), code) && step > last && hit === null) {
            hit = step;
        }
    }
    return hit === null ? { ok: false } : { ok: true, step: hit };
}

// ---- recovery codes ----

// no 0/O/1/I/L: they are read off a printout
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_LENGTH = 10;
export const RECOVERY_CODE_COUNT = 10;

/** `ABCDE-FGHJK`: 10 random characters from 31, about 50 bits. */
function recoveryCode(): string {
    let raw = '';
    for (let i = 0; i < RECOVERY_LENGTH; i++) {
        raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    }
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
    return Array.from({ length: count }, recoveryCode);
}

/** Case, spaces and the dash do not matter when a code is typed back. */
export const normalizeRecoveryCode = (code: string) =>
    code.replace(/[\s-]/g, '').toUpperCase();

/**
 * What is stored: an HMAC keyed by the server's secret, so a copy of the table
 * alone cannot be used to test guesses offline. A slow hash is not needed for a
 * long random value.
 */
export const hashRecoveryCode = (code: string, key: string) =>
    createHmac('sha256', key)
        .update(`recovery-code:${normalizeRecoveryCode(code)}`)
        .digest('hex');

/** How codes made before the keyed hash were stored; still accepted, never written. */
export const legacyHashRecoveryCode = (code: string) =>
    createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
