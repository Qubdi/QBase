import i18n from 'i18next';
import { toast } from '@/platform/toast/use-toast';
import type { ConnectOutcome } from './canvas-actions';
import { isMacPlatform } from './keyboard';

/** The text of the paste key for this platform (EDT-228: Cmd on a Mac). */
export function pasteKeyLabel(): string {
    return isMacPlatform() ? '⌘V' : 'Ctrl+V';
}

/** Tells the person why a drag between two fields made nothing (EDT-154, EDT-155). */
export function reportConnect(outcome: ConnectOutcome): void {
    if (outcome.kind === 'incompatible')
        toast({
            variant: 'destructive',
            title: i18n.t('canvas.link.incompatible.title'),
            description: i18n.t('canvas.link.incompatible.text'),
        });
    else if (outcome.kind === 'exists')
        toast({
            variant: 'destructive',
            title: i18n.t('canvas.link.exists.title'),
            description: i18n.t('canvas.link.exists.text'),
        });
}

export function reportCopied(count: number): void {
    toast({
        title:
            count === 1
                ? i18n.t('canvas.clipboard.copiedOne')
                : i18n.t('canvas.clipboard.copiedMany', { count }),
        description: i18n.t('canvas.clipboard.hint', { key: pasteKeyLabel() }),
    });
}

export function reportPasted(count: number): void {
    toast({
        title:
            count === 1
                ? i18n.t('canvas.clipboard.pastedOne')
                : i18n.t('canvas.clipboard.pastedMany', { count }),
    });
}
