import { newId } from '@/core/model/ids';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves conflicting Tailwind classes (last wins). */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

/** An opaque id for a table, field, index, relationship and the like: 25 characters. */
export const generateId = (): string => newId();

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
