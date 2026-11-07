import { i18n } from '@/i18n/i18n';
import { toast } from '@/platform/toast/use-toast';

/**
 * Puts `text` on the system clipboard. When that is not possible it shows the one
 * "Copy failed" toast (EDT-272), saying whether the browser has no clipboard or
 * the write was refused, and returns false. The caller shows its own success toast.
 */
export async function copyText(text: string): Promise<boolean> {
    const clipboard =
        typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
        fail('unsupported');
        return false;
    }
    try {
        await clipboard.writeText(text);
        return true;
    } catch {
        fail('generic');
        return false;
    }
}

function fail(reason: 'unsupported' | 'generic') {
    toast({
        title: i18n.t('editor.common.copyFailed.title'),
        description: i18n.t(`editor.common.copyFailed.${reason}`),
        variant: 'destructive',
    });
}
