// Switches off two-factor sign-in for one account, from the server's own
// command line, for when the phone and the recovery codes are both gone and
// there is no other admin to do it in the Users page:
//   npm run mfa:reset -- person@example.com          (from a source checkout)
//   docker compose exec app node dist/server/src/cli/mfa-reset.js person@example.com
// Whoever can run it already has the database, so it asks for nothing more.
// It clears the secret and the recovery codes, signs the account out
// everywhere and writes an `mfa.reset` row to the activity log.
// Exit codes: 0 = reset (or nothing to reset), 1 = no such account, 2 = bad usage.
import { sql } from 'drizzle-orm';
import { audit } from '../audit/audit.js';
import { createMfa } from '../auth/mfa.js';
import { destroyOtherSessions } from '../auth/sessions.js';
import { loadConfig, type Config } from '../config.js';
import { createDb, type Db } from '../db/client.js';
import { users } from '../db/schema.js';

const USAGE = 'Usage: mfa-reset <email>\n';

export type ResetOutcome = 'reset' | 'not_enabled' | 'no_such_user';

export async function resetMfaByEmail(
    db: Db,
    email: string,
    // clearing a secret needs no key, so tests and callers may leave this out
    config: Pick<Config, 'secretsKey' | 'mfaWindowSteps'> = {
        secretsKey: null,
        mfaWindowSteps: 1,
    }
): Promise<ResetOutcome> {
    const [user] = await db
        .select({ id: users.id, enabledAt: users.mfaEnabledAt })
        .from(users)
        .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
    if (!user) return 'no_such_user';
    if (user.enabledAt === null) return 'not_enabled';
    await createMfa(db, config).clear(user.id);
    await destroyOtherSessions(db, user.id, undefined);
    // nobody is signed in to act, so the row names the account itself
    await audit(db, {
        userId: user.id,
        action: 'mfa.reset',
        meta: { targetUserId: user.id },
    });
    return 'reset';
}

export async function main(argv: string[]): Promise<number> {
    const [email, ...rest] = argv;
    if (!email || rest.length > 0 || email.startsWith('-')) {
        process.stderr.write(USAGE);
        return 2;
    }
    const config = loadConfig();
    const { db, pool } = createDb(config.databaseUrl);
    try {
        const outcome = await resetMfaByEmail(db, email, config);
        if (outcome === 'no_such_user') {
            process.stderr.write(`No account with the email ${email}\n`);
            return 1;
        }
        process.stdout.write(
            outcome === 'reset'
                ? `Two-factor sign-in is off for ${email}; they were signed out everywhere.\n`
                : `${email} does not have two-factor sign-in on; nothing changed.\n`
        );
        return 0;
    } finally {
        await pool.end();
    }
}

if (process.argv[1] && /mfa-reset\.[cm]?[jt]s$/.test(process.argv[1])) {
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (err: unknown) => {
            console.error(err);
            process.exit(2);
        }
    );
}
