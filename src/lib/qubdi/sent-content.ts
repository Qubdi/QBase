// What this editor sent to the server for each local diagram since the last
// save it saw confirmed. A save can
// reach the server while its reply is lost (a reload or closed tab mid-request),
// which leaves the editor with an old version and a false "someone else saved"
// conflict. If the server's copy is exactly what was sent, the save was ours.
const KEY = 'qubdidb.sent-content';

type Sent = Record<string, string[]>;

// a few sends are enough: it is only the ones whose reply never came back
const MAX_KEPT = 5;

const memory: Sent = {};

// the same content with its keys in any order gives the same text; the
// top-level updatedAt is the server's own clock and is left out
const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, v: unknown) =>
        v && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(
                  Object.entries(v as Record<string, unknown>).sort(
                      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
                  )
              )
            : v
    );

const fingerprint = (content: Record<string, unknown>): string => {
    const rest = { ...content };
    delete rest.updatedAt;
    const text = canonical(rest);
    // FNV-1a: small enough for session storage, and only ever compared
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return `${text.length}:${(h >>> 0).toString(16)}`;
};

const read = (): Sent => {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const write = (localId: string, prints: string[]) => {
    memory[localId] = prints;
    try {
        sessionStorage.setItem(
            KEY,
            JSON.stringify({ ...read(), [localId]: prints })
        );
    } catch {
        // storage unavailable: the in-memory copy is used
    }
};

const sentOf = (localId: string): string[] =>
    memory[localId] ?? read()[localId] ?? [];

/** Call just before sending `content`, since the reply may never arrive. */
export const rememberSentContent = (
    localId: string,
    content: Record<string, unknown>
) => {
    write(localId, [...sentOf(localId), fingerprint(content)].slice(-MAX_KEPT));
};

/** The server answered a save, so nothing sent earlier is in doubt any more. */
export const confirmSentContent = (localId: string) => write(localId, []);

/** True when the server's content is something this editor sent. */
export const isLastSentContent = (
    localId: string,
    content: Record<string, unknown> | null
): boolean => !!content && sentOf(localId).includes(fingerprint(content));
