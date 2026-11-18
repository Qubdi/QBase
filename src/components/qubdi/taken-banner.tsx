import React from 'react';
import { BellRing, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { usePoke } from './use-poke';

/** 4:05 for 245 000 ms; a started second counts. */
const clock = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export interface TakenBannerProps {
    remoteId: string;
    /** why the diagram is read-only, already worded */
    reason: string;
    /** who is editing, when the server said */
    holder: string | null;
    /** the editor is this user's own other tab or window: nobody to poke */
    ownTab: boolean;
}

/**
 * Says, hard to miss, that someone else is editing this diagram and has to
 * leave it before you can continue; and lets you poke them: ask them, right
 * now, to step out. They agree or decline, and you are told which.
 */
export const TakenBanner: React.FC<TakenBannerProps> = ({
    remoteId,
    reason,
    holder,
    ownTab,
}) => {
    const { t } = useTranslation();
    const poke = usePoke(remoteId);
    const { view, cooldownLeftMs } = poke;
    const who = holder ?? t('qubdi.workspace.lockedReason.someoneElse');

    let note: string | null = null;
    switch (view.kind) {
        case 'waiting':
            note = t('qubdi.workspace.accessBanner.pokeSent', {
                holder: who,
                seconds: view.secondsLeft,
            });
            break;
        case 'declined':
            note = t('qubdi.workspace.accessBanner.pokeDeclined');
            break;
        case 'unanswered':
            note = t('qubdi.workspace.accessBanner.pokeUnanswered', {
                holder: who,
            });
            break;
        case 'accepted':
            note = t('qubdi.workspace.accessBanner.pokeAccepted', {
                holder: who,
            });
            break;
        case 'refused':
            note = view.message;
            break;
    }

    const cooling = cooldownLeftMs > 0;
    const inFlight =
        view.kind === 'sending' ||
        view.kind === 'waiting' ||
        view.kind === 'accepted';
    const label =
        view.kind === 'sending'
            ? t('qubdi.workspace.accessBanner.poking')
            : view.kind === 'waiting'
              ? t('qubdi.workspace.accessBanner.pokeWaiting')
              : view.kind === 'accepted'
                ? t('qubdi.workspace.accessBanner.pokeLoading')
                : cooling
                  ? t('qubdi.workspace.accessBanner.pokeAgainIn', {
                        time: clock(cooldownLeftMs),
                    })
                  : t('qubdi.workspace.accessBanner.poke');

    return (
        <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-50"
        >
            <Lock className="size-4 shrink-0" />
            <p className="min-w-56 flex-1 leading-snug">
                <span className="font-medium">{reason}</span>{' '}
                <span>
                    {ownTab
                        ? t('qubdi.workspace.accessBanner.takenSelfHint')
                        : t('qubdi.workspace.accessBanner.takenHint')}
                </span>
                {note ? (
                    <>
                        {' '}
                        <span className="font-medium">{note}</span>
                    </>
                ) : null}
            </p>
            {ownTab ? null : (
                <Button
                    size="sm"
                    disabled={inFlight || cooling}
                    title={t('qubdi.workspace.accessBanner.pokeHint', {
                        holder: who,
                    })}
                    onClick={poke.send}
                >
                    <BellRing />
                    {label}
                </Button>
            )}
        </div>
    );
};
