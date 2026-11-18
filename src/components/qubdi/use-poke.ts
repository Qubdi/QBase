import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/platform/toast/use-toast';
import { useStorage } from '@/qbase/use-storage';
import { api, ApiError, errorMessage } from '@/lib/qubdi/api';
import { getEditorId } from '@/lib/qubdi/editor-id';
import { getLatestFromServer } from '@/lib/qubdi/get-latest';
import { discardUnsavedChanges } from '@/lib/qubdi/save-status-store';
import { useDiagramAccess } from './diagram-access-context';
import { useLockChannel } from './lock-channel-context';
import { useWorkspace } from './workspace-context';

/** How long after poking the same diagram can be poked again; the server holds the same limit. */
export const POKE_COOLDOWN_MS = 5 * 60_000;

type Phase =
    | { kind: 'idle' }
    | { kind: 'sending' }
    /** asked; `until` is when the request stops waiting, on this browser's clock */
    | { kind: 'waiting'; pokeId: string; until: number }
    /** nobody was editing after all: the diagram is set aside for this user */
    | { kind: 'granted' }
    /** the server said no, or the latest version could not be loaded */
    | { kind: 'refused'; message: string };

/** What the banner shows about the request. */
export type PokeView =
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'waiting'; secondsLeft: number }
    | { kind: 'declined' }
    /** the holder did not answer in time */
    | { kind: 'unanswered' }
    /** the holder stepped out (or left): the latest version is being loaded */
    | { kind: 'accepted' }
    | { kind: 'refused'; message: string };

export interface PokeApi {
    view: PokeView;
    /** how long until the next poke is allowed; 0 when it is allowed now */
    cooldownLeftMs: number;
    send: () => void;
}

/**
 * Asks the editor that holds a diagram to step out, and follows the request
 * to its end. The answer arrives on the lock stream (see useLockStream); once
 * the diagram is free (the holder agreed or left, or nobody held it) the page
 * loads the latest version, which brings the lock with it: the server set the
 * lock aside for this user, and the reloaded page claims it.
 *
 * What is shown is worked out from three things: this editor's own part of the
 * request, what the stream said, and a clock that ticks while there is
 * something to count down. So an answer that beats the reply to the poke, or
 * a request that runs out, needs no extra bookkeeping.
 */
export function usePoke(remoteId: string): PokeApi {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { refresh } = useDiagramAccess();
    const { result } = useLockChannel();
    const workspace = useWorkspace();
    const { deleteDiagram } = useStorage();
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    let view: PokeView;
    switch (phase.kind) {
        case 'granted':
            view = { kind: 'accepted' };
            break;
        case 'waiting': {
            const answer =
                result?.pokeId === phase.pokeId ? result.outcome : null;
            if (answer === 'declined') view = { kind: 'declined' };
            else if (answer) view = { kind: 'accepted' };
            else if (now >= phase.until) view = { kind: 'unanswered' };
            else {
                view = {
                    kind: 'waiting',
                    secondsLeft: Math.ceil((phase.until - now) / 1000),
                };
            }
            break;
        }
        default:
            view = phase;
    }

    // tick while a request counts down or the wait before the next one does
    const counting = view.kind === 'waiting' || cooldownUntil > now;
    useEffect(() => {
        if (!counting) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [counting]);

    // the diagram is free for this user: load its latest version, once
    const taking = view.kind === 'accepted';
    const started = useRef(false);
    useEffect(() => {
        if (!taking || started.current) return;
        started.current = true;
        const localId = workspace?.localDiagramId;
        const serverId = workspace?.remoteDiagramId;
        const slug = workspace?.project.slug;
        if (!localId || !serverId || !slug) {
            // no copy to replace: a reload opens the diagram afresh
            refresh();
            return;
        }
        getLatestFromServer({
            localId,
            remoteId: serverId,
            projectSlug: slug,
            deleteLocal: deleteDiagram,
            beforeDelete: discardUnsavedChanges,
        }).catch(() => {
            started.current = false;
            const message = t('qubdi.database.getLatest.failedTitle');
            toast({ title: message, variant: 'destructive' });
            setPhase({ kind: 'refused', message });
            // the diagram is this user's already (the server set it aside), so
            // poking again only retries loading it: do not make them wait
            setCooldownUntil(0);
        });
    }, [taking, workspace, deleteDiagram, refresh, toast, t]);

    const send = () => {
        if (phase.kind === 'sending' || cooldownUntil > now) return;
        setPhase({ kind: 'sending' });
        void (async () => {
            try {
                const res = await api.pokeLock(remoteId, getEditorId());
                if (res.status === 'granted') {
                    setPhase({ kind: 'granted' });
                    return;
                }
                const at = Date.now();
                setNow(at);
                setCooldownUntil(at + POKE_COOLDOWN_MS);
                setPhase({
                    kind: 'waiting',
                    pokeId: res.pokeId,
                    until: at + res.waitSeconds * 1000,
                });
            } catch (e) {
                if (e instanceof ApiError && e.code === 'poke_cooldown') {
                    // asked a moment ago (another page, or before a reload)
                    const at = Date.now();
                    setNow(at);
                    setCooldownUntil(at + (e.retryAfterMs ?? POKE_COOLDOWN_MS));
                    setPhase({ kind: 'idle' });
                    return;
                }
                setPhase({ kind: 'refused', message: errorMessage(e) });
            }
        })();
    };

    return { view, cooldownLeftMs: Math.max(0, cooldownUntil - now), send };
}
