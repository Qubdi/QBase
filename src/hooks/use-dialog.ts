import { useContext } from 'react';
import { DialogContext } from '@/context/dialog-context/dialog-context';
import type { DialogApi } from '@/context/dialog-context/dialog-context';

/** Opens and closes the editor's dialogs; works below `DialogProvider`. */
export function useDialog(): DialogApi {
    return useContext(DialogContext);
}
