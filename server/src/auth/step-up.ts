import { eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import type { Config } from '../config.js';
import type { AuthGuards } from './guards.js';
import type { Mfa } from './mfa.js';
import { verifyPassword } from './password.js';

/** What a request sends to prove the signed-in person is really the one asking. */
export const stepUpFields = {
    adminPassword: z.string().max(200).optional(),
    /** a code from the authenticator app, or one recovery code */
    adminCode: z.string().max(40).optional(),
};

export interface StepUpInput {
    adminPassword?: string;
    adminCode?: string;
}

/**
 * Asks the signed-in person for their own password, and for a code when their
 * account has two-factor on, before something that takes over another
 * account. A stolen session alone then cannot do it. Failures count against
 * the same lockout as changing a password or turning two-factor off.
 *
 * Answers the request itself and returns false when it is not satisfied; true
 * means go on. `step_up_required` (nothing sent) is not counted as a failure.
 */
export function createStepUp(deps: {
    db: Db;
    config: Pick<Config, 'mfaEnabled'>;
    mfa: Mfa | null;
    guards: AuthGuards;
}) {
    const { db, config, mfa, guards } = deps;
    return async (
        req: FastifyRequest,
        reply: FastifyReply,
        input: StepUpInput
    ): Promise<boolean> => {
        const userId = req.user!.id;
        if (input.adminPassword === undefined || input.adminPassword === '') {
            reply.code(403).send({ error: 'step_up_required' });
            return false;
        }
        // the key every password check of this account counts under, so
        // change-password and two-factor off hold the same lockout
        const key = `password:${userId}`;
        if (guards.locked(reply, key)) return false;
        const [user] = await db
            .select({
                passwordHash: users.passwordHash,
                mfaEnabledAt: users.mfaEnabledAt,
            })
            .from(users)
            .where(eq(users.id, userId));
        if (!user || !(await verifyPassword(user.passwordHash, input.adminPassword))) {
            guards.failures.recordFailure(key);
            await audit(db, { userId, action: 'user.password_check_failed' });
            reply.code(403).send({ error: 'wrong_password' });
            return false;
        }
        guards.failures.reset(key);

        if (config.mfaEnabled && mfa && user.mfaEnabledAt) {
            if (input.adminCode === undefined || input.adminCode.trim() === '') {
                reply.code(403).send({ error: 'mfa_code_required' });
                return false;
            }
            if (guards.mfaGuard.locked(reply, req, userId)) return false;
            const typed = input.adminCode.replace(/\s/g, '');
            // six digits are an app code; anything else is tried as a recovery code
            const ok = /^\d{6}$/.test(typed)
                ? await mfa.checkCode(userId, typed)
                : await mfa.spendRecoveryCode(userId, input.adminCode);
            if (!ok) {
                guards.mfaGuard.fail(req, userId);
                await audit(db, { userId, action: 'mfa.failed' });
                reply.code(403).send({ error: 'invalid_code' });
                return false;
            }
            if (!/^\d{6}$/.test(typed)) {
                await audit(db, { userId, action: 'mfa.recovery_used' });
            }
            guards.mfaGuard.reset(req, userId);
        }
        return true;
    };
}
