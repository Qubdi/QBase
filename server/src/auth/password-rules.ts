import type { Config } from '../config.js';
import {
    checkPassword,
    type PasswordRuleId,
} from '../../../shared/password.js';

export interface WeakPassword {
    error: 'weak_password';
    /** the rules the password breaks, so the form can say exactly what is missing */
    rules: PasswordRuleId[];
}

/**
 * The reply for a password that may not be set, or null when it is fine.
 * Used wherever a password is chosen (first-admin sign-up, change password,
 * admin create user, admin reset), never at sign-in.
 */
export const weakPassword = (
    config: Pick<Config, 'passwordMinLength'>,
    password: string,
    email: string
): WeakPassword | null => {
    const rules = checkPassword(password, {
        minLength: config.passwordMinLength,
        email,
    });
    return rules.length > 0 ? { error: 'weak_password', rules } : null;
};
