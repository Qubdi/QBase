// The rules a password must meet when it is SET (first-admin sign-up, change
// password, admin create user, admin reset). They are never applied at sign-in,
// so people who chose a password under older rules can still get in.
// checkPassword() is pure and has no dependencies: the server is the authority
// and the browser calls the same function for the live checklist.

export const DEFAULT_PASSWORD_MIN_LENGTH = 12;
/** The floor for PASSWORD_MIN_LENGTH: the minimum before these rules existed. */
export const PASSWORD_MIN_LENGTH_FLOOR = 8;
export const PASSWORD_MAX_LENGTH = 200;
/** Shorter than this, the part of an email before the @ is not compared (it would match almost anything). */
const MIN_LOCAL_PART_LENGTH = 3;

export type PasswordRuleId =
    'min_length' | 'max_length' | 'uppercase' | 'number' | 'symbol' | 'email';

export interface PasswordRuleInfo {
    id: PasswordRuleId;
    /** What the checklist says, e.g. "At least 12 characters" */
    label: string;
}

export interface PasswordOptions {
    /** Defaults to DEFAULT_PASSWORD_MIN_LENGTH; never below PASSWORD_MIN_LENGTH_FLOOR */
    minLength?: number;
    /** The account's email: the password may not be it or contain the part before the @ */
    email?: string;
}

/** A whole number from the setting, clamped to the floor; anything else gives the default. */
export const normalizeMinLength = (value: number | undefined): number =>
    value === undefined || !Number.isFinite(value)
        ? DEFAULT_PASSWORD_MIN_LENGTH
        : Math.min(
              PASSWORD_MAX_LENGTH,
              Math.max(PASSWORD_MIN_LENGTH_FLOOR, Math.floor(value))
          );

// Unicode classes, so letters outside English work: a capital is \p{Lu}, a
// number \p{Nd}, and a symbol is anything that is not a letter, a number or
// whitespace (spaces are allowed in a password but do not count as a symbol).
const HAS_CAPITAL = /\p{Lu}/u;
const HAS_NUMBER = /\p{Nd}/u;
const HAS_SYMBOL = /[^\p{L}\p{N}\s]/u;

/** The rules that apply, in the order a checklist shows them. */
export const passwordRules = (
    options: PasswordOptions = {}
): PasswordRuleInfo[] => {
    const rules: PasswordRuleInfo[] = [
        {
            id: 'min_length',
            label: `At least ${normalizeMinLength(options.minLength)} characters`,
        },
        { id: 'uppercase', label: 'A capital letter' },
        { id: 'number', label: 'A number' },
        { id: 'symbol', label: 'A symbol, such as ! or #' },
    ];
    if (options.email) {
        rules.push({ id: 'email', label: 'Not your email address' });
    }
    return rules;
};

const containsEmailPart = (password: string, email: string): boolean => {
    const lower = password.toLowerCase();
    const address = email.trim().toLowerCase();
    if (!address) return false;
    if (lower.includes(address)) return true;
    const local = address.split('@')[0] ?? '';
    return local.length >= MIN_LOCAL_PART_LENGTH && lower.includes(local);
};

/** The rules this password breaks. An empty list means it is acceptable. */
export const checkPassword = (
    password: string,
    options: PasswordOptions = {}
): PasswordRuleId[] => {
    const broken: PasswordRuleId[] = [];
    if (password.length < normalizeMinLength(options.minLength)) {
        broken.push('min_length');
    }
    if (password.length > PASSWORD_MAX_LENGTH) broken.push('max_length');
    if (!HAS_CAPITAL.test(password)) broken.push('uppercase');
    if (!HAS_NUMBER.test(password)) broken.push('number');
    if (!HAS_SYMBOL.test(password)) broken.push('symbol');
    if (options.email && containsEmailPart(password, options.email)) {
        broken.push('email');
    }
    return broken;
};
