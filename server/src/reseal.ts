import { and, asc, eq, gt, like, or } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Db } from './db/client.js';
import {
    driftSettings,
    savedConnections,
    shareLinks,
    users,
} from './db/schema.js';
import { cryptoBoxFor, type CryptoBox } from './introspect/crypto-box.js';

/** What one column came to: values written as v2, and values nobody could open. */
export interface ResealCount {
    column: string;
    resealed: number;
    unreadable: number;
}

/** Rows read and rewritten together. */
const BATCH = 200;

/**
 * Opens a value in the v1 format: under the box's own key, else (for a value
 * sealed before purposes existed) under the shared key. Null when neither
 * opens it, for example after the key was changed.
 */
function openLegacy(box: CryptoBox, stored: string): string | null {
    try {
        return box.decrypt(stored);
    } catch {
        // fall through to the shared key
    }
    try {
        return box.decryptLegacyShared(stored);
    } catch {
        return null;
    }
}

/**
 * Re-seals every v1 value of one column as v2 under the box's own key (as v3,
 * bound to the row's id, for a `bound` column, whose v2 values are rewritten too). Each
 * batch is one transaction, and a row is only changed while it still holds the
 * value that was read, so running it again, or on several replicas at once, does
 * no harm. A value that cannot be opened is left as it is and counted.
 */
async function resealColumn(
    db: Db,
    column: string,
    table: PgTable,
    idColumn: PgColumn,
    encColumn: PgColumn,
    /** the property of the table's columns that `encColumn` is, which `set` is keyed by */
    field: string,
    box: CryptoBox,
    /**
     * true: the value is sealed bound to its row's id (v3), so v2 values are
     * rewritten too; false: the value is bound by other means (MFA secrets
     * carry their owner's id inside) and stays v2
     */
    bound: boolean
): Promise<ResealCount> {
    const count: ResealCount = { column, resealed: 0, unreadable: 0 };
    let after: string | null = null;
    for (;;) {
        const lastSeen: string | null = after;
        const rows: { id: string; enc: string }[] = (
            await db
                .select({ id: idColumn, enc: encColumn })
                .from(table)
                .where(
                    and(
                        bound
                            ? or(like(encColumn, 'v1:%'), like(encColumn, 'v2:%'))
                            : like(encColumn, 'v1:%'),
                        lastSeen === null ? undefined : gt(idColumn, lastSeen)
                    )
                )
                .orderBy(asc(idColumn))
                .limit(BATCH)
        ).map((r) => ({ id: String(r.id), enc: String(r.enc) }));
        if (rows.length === 0) return count;
        await db.transaction(async (tx) => {
            for (const row of rows) {
                const plain = openLegacy(box, row.enc);
                if (plain === null) {
                    count.unreadable += 1;
                    continue;
                }
                const changed = await tx
                    .update(table)
                    .set({ [field]: bound ? box.encrypt(plain, row.id) : box.encrypt(plain) } as Record<string, unknown>)
                    .where(and(eq(idColumn, row.id), eq(encColumn, row.enc)))
                    .returning({ id: idColumn });
                count.resealed += changed.length;
            }
        });
        after = rows[rows.length - 1].id;
    }
}

/**
 * Writes every encrypted value the server keeps in the current format, under
 * the key of its own purpose (all but the MFA secrets bound to their row's id):
 * - authenticator secrets (`users.mfa_secret_enc`, purpose `mfa`)
 * - drift webhook URLs (`drift_settings.webhook_url`, purpose `webhook`)
 * - share-link tokens (`share_links.token_enc`, purpose `share-link`)
 * - saved connection passwords (`saved_connections.password_enc`, no purpose)
 *
 * Values from before purposes existed were sealed with the shared key; they
 * are opened with it here, once, and `CryptoBox.decrypt` no longer falls back
 * to it. Run at start; safe to run again.
 */
export async function resealStoredSecrets(
    db: Db,
    keys: { secretsKey: string | null; connectionKey: string | null }
): Promise<ResealCount[]> {
    const done: ResealCount[] = [];
    if (keys.secretsKey) {
        done.push(
            await resealColumn(
                db,
                'users.mfa_secret_enc',
                users,
                users.id,
                users.mfaSecretEnc,
                'mfaSecretEnc',
                cryptoBoxFor(keys.secretsKey, 'mfa'),
                false
            ),
            await resealColumn(
                db,
                'drift_settings.webhook_url',
                driftSettings,
                driftSettings.diagramId,
                driftSettings.webhookUrl,
                'webhookUrl',
                cryptoBoxFor(keys.secretsKey, 'webhook'),
                true
            )
        );
    }
    if (keys.connectionKey) {
        done.push(
            await resealColumn(
                db,
                'share_links.token_enc',
                shareLinks,
                shareLinks.id,
                shareLinks.tokenEnc,
                'tokenEnc',
                cryptoBoxFor(keys.connectionKey, 'share-link'),
                true
            ),
            await resealColumn(
                db,
                'saved_connections.password_enc',
                savedConnections,
                savedConnections.id,
                savedConnections.passwordEnc,
                'passwordEnc',
                cryptoBoxFor(keys.connectionKey),
                true
            )
        );
    }
    return done;
}
