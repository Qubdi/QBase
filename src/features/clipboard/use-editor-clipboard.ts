import { useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { makeClip, planPaste } from '@/core/commands/plan-entity';
import { getOperatingSystem } from '@/lib/utils';
import { toast } from '@/platform/toast/use-toast';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { useEditorStoreApi } from '@/store/store-context';
import { countPaste, recall, remember } from './clip-memory';

/**
 * Mod+C and Mod+V for the selected tables (EDT-227 to EDT-237). Only tables
 * travel, no links, and a paste is one undo step. Typing in a text box and
 * selected page text keep the browser's own copy and paste. Mount once, in the
 * editor frame.
 */
export function useEditorClipboard() {
    const store = useEditorStoreApi();
    const { edit, locked } = useEditorEnv();
    const text = useText();
    const onMac = getOperatingSystem() === 'mac';
    const mod = onMac ? 'meta' : 'ctrl';

    const copy = useCallback(() => {
        if (window.getSelection()?.toString()) return;
        const { design, ui } = store.getState();
        const ids = ui.selection.filter((id) => design.entities.byId[id]);
        const clip = makeClip(design, ids);
        if (clip.entities.length === 0) return;
        remember(clip);
        const count = clip.entities.length;
        toast({
            title:
                count === 1
                    ? text('clipboard.copied')
                    : text('clipboard.copiedMany', { count }),
            // EDT-228: the key of this platform
            description: text('clipboard.pasteHint', {
                key: onMac ? 'Cmd+V' : 'Ctrl+V',
            }),
        });
    }, [store, text, onMac]);

    const paste = useCallback(() => {
        const memory = recall();
        if (!memory || locked) return;
        const { design } = store.getState();
        const command = planPaste(design, memory.clip, memory.pastes);
        if (!command || !edit(command)?.ok) return;
        countPaste();
        const count = memory.clip.entities.length;
        toast({
            title:
                count === 1
                    ? text('clipboard.pasted')
                    : text('clipboard.pastedMany', { count }),
        });
    }, [store, edit, locked, text]);

    useHotkeys(`${mod}+c`, copy, { preventDefault: false }, [copy]);
    useHotkeys(`${mod}+v`, paste, { preventDefault: false }, [paste]);
    return { copy, paste };
}
