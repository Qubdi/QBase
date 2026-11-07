import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves conflicting Tailwind classes (last wins). */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random text of `length` characters from 0-9a-z, drawn from the browser's CSPRNG. */
const randomText = (length: number): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    let text = '';
    for (const byte of bytes) text += ID_ALPHABET[byte % ID_ALPHABET.length];
    return text;
};

/** An opaque id for a table, field, index, relationship and the like: 25 characters. */
export const generateId = (): string => randomText(25);

export type OperatingSystem = 'mac' | 'windows' | 'linux' | 'other';

/** The operating system the page runs on, read from the browser; `other` when unknown. */
export function getOperatingSystem(): OperatingSystem {
    if (typeof navigator === 'undefined') return 'other';
    const hint = (
        (navigator as Navigator & { userAgentData?: { platform?: string } })
            .userAgentData?.platform ||
        navigator.platform ||
        navigator.userAgent ||
        ''
    ).toLowerCase();
    if (/mac|iphone|ipad|ipod/.test(hint)) return 'mac';
    if (/win/.test(hint)) return 'windows';
    if (/linux|x11|android|cros/.test(hint)) return 'linux';
    return 'other';
}
