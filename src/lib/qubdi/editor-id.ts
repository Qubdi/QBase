import { generateId } from '@/lib/utils';

// Names this browser tab to the server's edit lock, so a second tab of the same
// user counts as a second editor. Kept for the life of the tab: a reload is the
// same editor and takes its lock back at once instead of waiting for it to run out.
const KEY = 'qbase.editor-id';

let id: string | undefined;

export const getEditorId = (): string => {
    if (id) return id;
    try {
        id = sessionStorage.getItem(KEY) ?? undefined;
    } catch {
        // storage unavailable: this tab keeps one id for as long as it stays open
    }
    if (!id) {
        id = generateId();
        try {
            sessionStorage.setItem(KEY, id);
        } catch {
            // see above
        }
    }
    return id;
};
