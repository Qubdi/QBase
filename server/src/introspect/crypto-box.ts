import {
    createCipheriv,
    createDecipheriv,
    hkdfSync,
    randomBytes,
    scryptSync,
} from 'node:crypto';

/** Length of the GCM authentication tag in bytes. */
const TAG_LENGTH = 16;
/** Length of the random salt each v2 value carries. */
const SALT_LENGTH = 16;

/** Salt of the v1 format, which derived one fixed key per purpose. */
const BASE_SALT = 'qubdidb-connection-box-v1';

/**
 * AES-256-GCM. The key comes from the environment. Saved connection passwords
 * use no purpose; other users of the same secret (MFA seeds, webhook URLs, share
 * tokens) name one, so each gets its own key and a value sealed for one never
 * opens for another.
 *
 * Three formats are read, two are written:
 * - `v3:salt:iv:tag:data` (written when the caller names a context, normally
 *   the id of the row that holds the value): the same as v2, with the context
 *   authenticated as GCM additional data. A value copied to another row, or
 *   another column of the same purpose, fails to open there.
 * - `v2:salt:iv:tag:data` (written without a context; read): the key is derived from the secret with
 *   HKDF-SHA256, a fresh random salt and the purpose, so no two values share a
 *   key. HKDF is fast and does not block the event loop; the secret must be
 *   random (at least 32 characters, see `loadConfig`), which is what it relies
 *   on in place of a slow hash.
 * - `v1:iv:tag:data` (read only): one key per purpose from scrypt with a fixed
 *   salt. Values in it are re-sealed as v2 when the server starts.
 */
export class CryptoBox {
    private readonly secret: string;
    private readonly purpose: string | undefined;
    private v1Key: Buffer | undefined;

    constructor(secret: string, purpose?: string) {
        if (secret.length < 16) {
            throw new Error('The encryption key (SECRETS_KEY or CONNECTION_KEY) must be at least 16 characters');
        }
        this.secret = secret;
        this.purpose = purpose;
    }

    /** The key of the v1 format, derived on first use: scrypt is slow and blocks. */
    private keyV1(shared: boolean): Buffer {
        const salt =
            this.purpose && !shared ? `${BASE_SALT}:${this.purpose}` : BASE_SALT;
        if (shared) return scryptSync(this.secret, salt, 32);
        return (this.v1Key ??= scryptSync(this.secret, salt, 32));
    }

    private keyV2(salt: Buffer): Buffer {
        return Buffer.from(
            hkdfSync(
                'sha256',
                this.secret,
                salt,
                `qubdidb-box-v2:${this.purpose ?? ''}`,
                32
            )
        );
    }

    /** The additional data of a v3 value: the purpose and the caller's context. */
    private aad(context: string): Buffer {
        return Buffer.from(`${this.purpose ?? ''}\0${context}`, 'utf8');
    }

    encrypt(plain: string, context?: string): string {
        const salt = randomBytes(SALT_LENGTH);
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.keyV2(salt), iv, {
            authTagLength: TAG_LENGTH,
        });
        if (context !== undefined) cipher.setAAD(this.aad(context));
        const data = Buffer.concat([
            cipher.update(plain, 'utf8'),
            cipher.final(),
        ]);
        const tag = cipher.getAuthTag();
        return [context === undefined ? 'v2' : 'v3', salt, iv, tag, data]
            .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
            .join(':');
    }

    /**
     * Opens a value. A v3 value needs the context it was sealed with; v2 and
     * v1 values carry none and ignore it (they are re-sealed as v3 at start).
     */
    decrypt(payload: string, context?: string): string {
        const parts = payload.split(':');
        if ((parts[0] === 'v2' || parts[0] === 'v3') && parts.length === 5) {
            const [version, salt, iv, tag, data] = parts;
            const saltBytes = Buffer.from(salt, 'base64');
            if (saltBytes.length !== SALT_LENGTH) {
                throw new Error('Unsupported encrypted value');
            }
            if (version === 'v3' && context === undefined) {
                throw new Error('Unsupported encrypted value');
            }
            return open(
                this.keyV2(saltBytes),
                iv,
                tag,
                data,
                version === 'v3' ? this.aad(context!) : undefined
            );
        }
        if (parts[0] === 'v1' && parts.length === 4) {
            const [, iv, tag, data] = parts;
            // no fallback to the shared key: values sealed with it are re-sealed
            // at start (see reseal.ts) and `decryptLegacyShared` is for that alone
            return open(this.keyV1(false), iv, tag, data);
        }
        throw new Error('Unsupported encrypted value');
    }

    /**
     * Opens a v1 value sealed with the shared key, from before purposes
     * existed. Only the start-up re-seal calls it: everything it opens is
     * written back as v2 under this box's own key, and `decrypt` never falls
     * back to the shared key.
     */
    decryptLegacyShared(payload: string): string {
        const [version, iv, tag, data, extra] = payload.split(':');
        if (version !== 'v1' || extra !== undefined) {
            throw new Error('Unsupported encrypted value');
        }
        return open(this.keyV1(true), iv, tag, data);
    }
}

function open(
    key: Buffer,
    iv: string,
    tag: string,
    data: string | undefined,
    aad?: Buffer
): string {
    if (!iv || !tag || data === undefined) {
        throw new Error('Unsupported encrypted value');
    }
    const authTag = Buffer.from(tag, 'base64');
    // GCM accepts shorter tags, which are far easier to forge: refuse them
    if (authTag.length !== TAG_LENGTH) {
        throw new Error('Unsupported encrypted value');
    }
    const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv, 'base64'),
        { authTagLength: TAG_LENGTH }
    );
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
    ]).toString('utf8');
}

/** True for a value in a format this box writes or reads (not plain text). */
export const isSealed = (value: string) =>
    value.startsWith('v1:') || value.startsWith('v2:') || value.startsWith('v3:');

/** True for a value already in the format `encrypt` writes without a context. */
export const isCurrentFormat = (value: string) => value.startsWith('v2:');

const boxes = new Map<string, CryptoBox>();

/**
 * The box for a secret, made once. Opening a v1 value derives its key with
 * scrypt, which is slow and blocks, so that key is kept on the box: code that
 * opens values per request or per check asks here instead of calling
 * `new CryptoBox`.
 */
export function cryptoBoxFor(secret: string, purpose?: string): CryptoBox {
    const id = `${purpose ?? ''}\0${secret}`;
    let box = boxes.get(id);
    if (!box) {
        box = new CryptoBox(secret, purpose);
        boxes.set(id, box);
    }
    return box;
}
