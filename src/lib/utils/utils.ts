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

const WORKSPACE_KEY = 'uuid';
const WORKSPACE_LENGTH = 8;
let workspaceInMemory: string | undefined;

/**
 * One short prefix per browser, kept in localStorage so ids made in this browser
 * share it. When storage is blocked, one prefix is kept for the life of the page.
 */
export const getWorkspaceId = (): string => {
    try {
        const saved = localStorage.getItem(WORKSPACE_KEY);
        if (saved) return saved;
        const fresh = randomText(WORKSPACE_LENGTH);
        localStorage.setItem(WORKSPACE_KEY, fresh);
        return fresh;
    } catch {
        workspaceInMemory ??= randomText(WORKSPACE_LENGTH);
        return workspaceInMemory;
    }
};

/** The id of a diagram kept in this browser: the workspace prefix plus 4 characters. */
export const generateDiagramId = (): string =>
    `${getWorkspaceId()}${randomText(4)}`;

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
