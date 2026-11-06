import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    scryptSync,
} from 'node:crypto';

/** Length of the GCM authentication tag in bytes. */
const TAG_LENGTH = 16;

const BASE_SALT = 'qubdidb-connection-box-v1';

/**
 * AES-256-GCM. The key comes from the environment. Saved connection passwords
 * use no purpose; other users of the same secret (MFA seeds, webhook URLs) name
 * one, so each gets its own key and a value sealed for one never opens for another.
 */
export class CryptoBox {
    private readonly key: Buffer;
    private readonly secret: string;
    private readonly purpose: string | undefined;
    private legacyKey: Buffer | undefined;

    constructor(secret: string, purpose?: string) {
        if (secret.length < 16) {
            throw new Error('The encryption key (SECRETS_KEY or CONNECTION_KEY) must be at least 16 characters');
        }
        this.secret = secret;
        this.purpose = purpose;
        // the salt is fixed per purpose: the secret itself is the entropy source
        this.key = scryptSync(
            secret,
            purpose ? `${BASE_SALT}:${purpose}` : BASE_SALT,
            32
        );
    }

    encrypt(plain: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv, {
            authTagLength: TAG_LENGTH,
        });
        const data = Buffer.concat([
            cipher.update(plain, 'utf8'),
            cipher.final(),
        ]);
        const tag = cipher.getAuthTag();
        return ['v1', iv, tag, data]
            .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
            .join(':');
    }

    decrypt(payload: string): string {
        const [version, iv, tag, data] = payload.split(':');
        if (version !== 'v1' || !iv || !tag || data === undefined) {
            throw new Error('Unsupported encrypted value');
        }
        const authTag = Buffer.from(tag, 'base64');
        // GCM accepts shorter tags, which are far easier to forge: refuse them
        if (authTag.length !== TAG_LENGTH) {
            throw new Error('Unsupported encrypted value');
        }
        const open = (key: Buffer) => {
            const decipher = createDecipheriv(
                'aes-256-gcm',
                key,
                Buffer.from(iv, 'base64'),
                { authTagLength: TAG_LENGTH }
            );
            decipher.setAuthTag(authTag);
            return Buffer.concat([
                decipher.update(Buffer.from(data, 'base64')),
                decipher.final(),
            ]).toString('utf8');
        };
        try {
            return open(this.key);
        } catch (err) {
            if (!this.purpose) throw err;
            // values sealed before purposes existed used the shared key
            this.legacyKey ??= scryptSync(this.secret, BASE_SALT, 32);
            return open(this.legacyKey);
        }
    }
}

const boxes = new Map<string, CryptoBox>();

/**
 * The box for a secret, made once. Deriving its key is slow on purpose
 * (scrypt, and it blocks the event loop), so code that opens one per request
 * or per check asks here instead of calling `new CryptoBox`.
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
