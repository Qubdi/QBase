import { createHash, randomBytes } from 'node:crypto';

/** 128 bits of randomness, URL-safe (22 base64url characters). */
export const generateToken = () => randomBytes(16).toString('base64url');

export const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

/** Cheap shape check so junk never reaches the database. */
export const isWellFormedToken = (token: string) => TOKEN_RE.test(token);
