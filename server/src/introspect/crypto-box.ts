import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    scryptSync,
} from 'node:crypto';

/** AES-256-GCM for saved connection passwords. Key comes from the environment. */
export class CryptoBox {
    private readonly key: Buffer;

    constructor(secret: string) {
        if (secret.length < 16) {
            throw new Error('The encryption key (SECRETS_KEY or CONNECTION_KEY) must be at least 16 characters');
        }
        // fixed salt is fine: the secret itself is the entropy source
        this.key = scryptSync(secret, 'qubdidb-connection-box-v1', 32);
    }

    encrypt(plain: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv);
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
        const decipher = createDecipheriv(
            'aes-256-gcm',
            this.key,
            Buffer.from(iv, 'base64')
        );
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([
            decipher.update(Buffer.from(data, 'base64')),
            decipher.final(),
        ]).toString('utf8');
    }
}
