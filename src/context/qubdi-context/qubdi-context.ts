import { createContext } from 'react';
import type { RemoteUser, RequestOptions } from '@/lib/qubdi/api';
import type { Diagram } from '@/lib/domain/diagram';

export interface QubdiContext {
    enabled: boolean;
    /** undefined while the first /auth/me call is in flight */
    user: RemoteUser | null | undefined;
    /** the user was signed out by the server (an account has one live session) */
    sessionEnded: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
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
    register: reject,
    logout: reject,
    syncDiagram: reject,
    remoteIdFor: () => undefined,
});
