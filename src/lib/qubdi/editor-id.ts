import { generateId } from '@/lib/utils';

// Names this open page to the server's edit lock, so a second tab of the same
// user counts as a second editor. Kept in memory only: session storage is
// copied when a tab is duplicated, and two tabs holding one id would share one
// lock. A reload is a new editor; the page gives its lock back as it leaves
// (use-edit-lock), so the new one takes it at once.
let id: string | undefined;

export const getEditorId = (): string => (id ??= generateId());
