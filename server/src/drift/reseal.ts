import { and, eq, isNotNull, notLike } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { driftSettings } from '../db/schema.js';
import { cryptoBoxFor } from '../introspect/crypto-box.js';
import { sealWebhookUrl } from './webhook.js';

/**
 * Webhook URLs saved before they were encrypted are still plain text in the
 * table, and a token in their path sits there for anyone who can read it.
 * Seals each one. Safe to run again and from several replicas at once: a row
 * is only changed while it still holds the value that was read.
 */
export async function resealPlaintextWebhooks(
    db: Db,
    secretsKey: string
): Promise<number> {
    const box = cryptoBoxFor(secretsKey, 'webhook');
    const rows = await db
        .select({
            diagramId: driftSettings.diagramId,
            webhookUrl: driftSettings.webhookUrl,
        })
        .from(driftSettings)
        .where(
            and(
                isNotNull(driftSettings.webhookUrl),
                notLike(driftSettings.webhookUrl, 'v1:%'),
                notLike(driftSettings.webhookUrl, 'v2:%'),
                notLike(driftSettings.webhookUrl, 'v3:%')
            )
        );
    let sealed = 0;
    for (const row of rows) {
        if (!row.webhookUrl) continue;
        const changed = await db
            .update(driftSettings)
            .set({ webhookUrl: sealWebhookUrl(box, row.diagramId, row.webhookUrl) })
            .where(
                and(
                    eq(driftSettings.diagramId, row.diagramId),
                    eq(driftSettings.webhookUrl, row.webhookUrl)
                )
            )
            .returning({ diagramId: driftSettings.diagramId });
        sealed += changed.length;
    }
    return sealed;
}
