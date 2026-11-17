import { createContext, useContext } from 'react';

/** Another editor asking this one, which holds the diagram, to step out. */
export interface IncomingPoke {
    pokeId: string;
    /** who asks, by email */
    from: string;
}

/** How a request this editor made ended. */
export interface PokeResult {
    pokeId: string;
    /** `left`: the holder closed the diagram on its own while the request waited */
    outcome: 'accepted' | 'declined' | 'left';
}

/** What the open diagram's lock stream has told this editor. */
export interface LockChannelValue {
    /** a request waiting for this editor's answer; null when none is */
    incoming: IncomingPoke | null;
    /** the answer to the latest request this editor made, once it came */
    result: PokeResult | null;
    /** stops showing a request that was answered or no longer matters */
    dismiss: (pokeId: string) => void;
}

export const LockChannelContext = createContext<LockChannelValue>({
    incoming: null,
    result: null,
    dismiss: () => undefined,
});

export const useLockChannel = () => useContext(LockChannelContext);
