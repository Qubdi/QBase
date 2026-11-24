import { safeError } from './lib/safe-error.js';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { users } from './db/schema.js';
import { resealPlaintextWebhooks } from './drift/reseal.js';
import { resealStoredSecrets } from './reseal.js';

/** Where the start-up tasks write to: the console, or a fake in a test. */
export interface StartupLog {
    log: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string, detail?: unknown) => void;
}

const consoleLog: StartupLog = {
    log: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m, d) => (d === undefined ? console.error(m) : console.error(m, d)),
};

/**
 * What runs once after the migrations and before the server listens. Returns
 * the config to serve with: on an empty server it carries a setup token.
 *
 * A failure of either re-seal leaves the values as they were and never stops
 * the server from starting.
 */
export async function runStartupTasks(
    db: Db,
    config: Config,
    out: StartupLog = consoleLog
): Promise<Config> {
    // webhook URLs saved before encryption existed are sealed now. A failure here
    // leaves them readable as before; it must not stop the server from starting.
    if (config.secretsKey) {
        try {
            const sealed = await resealPlaintextWebhooks(db, config.secretsKey);
            if (sealed > 0) out.log(`Encrypted ${sealed} saved webhook URL(s)`);
        } catch (err) {
            out.error(
                'Could not encrypt saved webhook URLs:',
                safeError(err).message
            );
        }
    }

    // values sealed in the old format, or with the shared key from before purposes
    // existed, are written again in the current one, so no open path falls back to
    // the shared key. A failure leaves them as they were and does not stop the server.
    try {
        for (const c of await resealStoredSecrets(db, config)) {
            if (c.resealed > 0) out.log(`Re-sealed ${c.resealed} value(s) in ${c.column}`);
            if (c.unreadable > 0) {
                out.warn(
                    `Warning: ${c.unreadable} value(s) in ${c.column} could not be opened with the current key and were left as they are`
                );
            }
        }
    } catch (err) {
        out.error('Could not re-seal stored secrets:', safeError(err).message);
    }

    // On an empty server the first sign-up becomes the admin, so it needs SETUP_TOKEN. The
    // server does not make one: with none set the first sign-up is refused, and this says so.
    if ((await db.select({ id: users.id }).from(users).limit(1)).length === 0) {
        if (config.setupToken !== null) {
            out.log('No account exists yet. Creating the first admin needs the SETUP_TOKEN you set.');
        } else if (config.allowOpenBootstrap) {
            out.warn(
                'No account exists yet and ALLOW_OPEN_BOOTSTRAP is on: the first person to reach this server becomes its admin.'
            );
        } else {
            out.warn(
                'No account exists yet. Set SETUP_TOKEN (at least 16 characters, e.g. `openssl rand -hex 16`) and restart: until then nobody can create the first admin.'
            );
        }
    }
    return config;
}
