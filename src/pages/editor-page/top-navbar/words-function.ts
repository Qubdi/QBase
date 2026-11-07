import type { register } from 'timeago.js';

/**
 * The timeago.js language files are CommonJS (`exports.default = fn`). The
 * production bundle can hand over the whole module instead of the function, and
 * the first "Saved ..." text in that language then threw "t is not a function"
 * and took the page down. Take the function out of either shape.
 */
export const wordsFunction = (mod: unknown): Parameters<typeof register>[1] => {
    let value = mod;
    while (typeof value !== 'function' && value && typeof value === 'object')
        value = (value as { default?: unknown }).default;
    return value as Parameters<typeof register>[1];
};
