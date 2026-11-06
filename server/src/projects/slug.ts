// A project's URL piece, e.g. "My Team" -> "My-Team" in /My-Team/diagrams.
// Letters and digits in any language are kept (they are URL-encoded in links).

/** Paths the app already uses; a project may not take one of them. */
export const RESERVED_SLUGS = [
    'admin',
    'api',
    'assets',
    'auth',
    'diagrams',
    'examples',
    'health',
    'login',
    'logout',
    'projects',
    's',
    'templates',
];

export function slugify(name: string): string {
    return name
        .normalize('NFC')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}._-]/gu, '')
        .replace(/-{2,}/g, '-')
        .replace(/^[-._]+|[-._]+$/g, '');
}

export type SlugCheck =
    | { ok: true; slug: string }
    | { ok: false; error: 'invalid_name' | 'reserved_name' };

/** The slug for a project name, or why the name cannot be used. */
export function slugFor(name: string): SlugCheck {
    const slug = slugify(name);
    if (!slug) return { ok: false, error: 'invalid_name' };
    if (RESERVED_SLUGS.includes(slug.toLowerCase())) {
        return { ok: false, error: 'reserved_name' };
    }
    return { ok: true, slug };
}
