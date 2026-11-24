import { hash, verify } from '@node-rs/argon2';

export const hashPassword = (password: string) => hash(password);

export async function verifyPassword(
    passwordHash: string | null,
    password: string
): Promise<boolean> {
    // a person QAuth knows has no password here: it is checked there
    if (passwordHash === null) return false;
    try {
        return await verify(passwordHash, password);
    } catch {
        return false;
    }
}

// A real hash, made once, for the sign-in of an email nobody has registered.
// Checking against it costs the same as checking a real account, so how long
// a sign-in takes does not tell whether the email exists.
let dummyHash: Promise<string> | undefined;

export async function verifyAgainstNobody(password: string): Promise<false> {
    dummyHash ??= hashPassword('no-such-account-password');
    await verifyPassword(await dummyHash, password);
    return false;
}
