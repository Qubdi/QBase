import type { ExtraKeys } from './column';
import type { Box } from './region';
import type { Id } from './id';

/** A sticky note: free text on a coloured card placed by `box`. */
export interface Memo {
    id: Id;
    box: Box;
    tint: string;
    body: string;
    extra?: ExtraKeys;
}

export const MEMO_SIZE = { width: 200, height: 150 };
export const MEMO_TINT = '#ffe374';
