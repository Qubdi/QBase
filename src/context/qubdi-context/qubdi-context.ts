import { createContext } from 'react';
import type { RemoteUser, RequestOptions, SecondFactor } from '@/lib/qubdi/api';
import type { Diagram } from '@/qbase/diagram-types';

export interface QubdiContext {
    enabled: boolean;
    /** undefined while the first /auth/me call is in flight */
    user: RemoteUser | null | undefined;
    /** the user was signed out by the server (an account has one live session) */
    sessionEnded: boolean;
    /**
     * Resolves with nothing once signed in, or with a ticket when the account
     * has two-factor on: no session yet, `loginMfa` finishes the sign-in.
     */
    login: (
        email: string,
        password: string
    ) => Promise<{ mfaChallenge: string } | void>;
    /** the second step of signing in: a code from the app or a recovery code */
    loginMfa: (challenge: string, factor: SecondFactor) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    /** asks the server who is signed in again, e.g. after the password was changed */
    refreshUser: () => Promise<void>;
    /**
     * Uploads the local diagram; returns the server diagram id. An unbound
     * diagram needs a `projectId` to be created in; without one this rejects.
     */
    syncDiagram: (
        diagram: Diagram,
        projectId?: string,
        options?: RequestOptions
    ) => Promise<string>;
    remoteIdFor: (localId: string) => string | undefined;
}

const reject = () => Promise.reject(new Error('QubdiProvider missing'));

export const qubdiContext = createContext<QubdiContext>({
    enabled: false,
    user: null,
    sessionEnded: false,
    login: reject,
    loginMfa: reject,
    register: reject,
    logout: reject,
    refreshUser: reject,
    syncDiagram: reject,
    remoteIdFor: () => undefined,
});
