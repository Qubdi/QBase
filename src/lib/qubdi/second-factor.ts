import type { SecondFactor } from './api';

/** The digits of a typed authenticator code (spaces and dashes are allowed). */
export const codeDigits = (text: string) => text.replace(/[\s-]/g, '');

export const isCode = (text: string) => /^\d{6}$/.test(codeDigits(text));

/**
 * One box that takes either kind of second factor: six digits are a code from
 * the app, anything else is read as a recovery code (`ABCDE-FGHJK`).
 */
export const factorFrom = (text: string): SecondFactor =>
    isCode(text) ? { code: codeDigits(text) } : { recoveryCode: text.trim() };

/** The key typed by hand, in groups of four so it is easy to read out. */
export const spacedKey = (secret: string) =>
    secret.replace(/(.{4})/g, '$1 ').trim();
