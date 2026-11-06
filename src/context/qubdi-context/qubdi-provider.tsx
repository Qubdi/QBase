import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { qubdiContext, type QubdiContext } from './qubdi-context';
import {
    api,
    ApiError,
    setSessionEndedHandler,
    type RemoteUser,
    type RequestOptions,
    type SecondFactor,
} from '@/lib/qubdi/api';
import { getEditorId } from '@/lib/qubdi/editor-id';
import { QUBDI_BACKEND_ENABLED } from '@/lib/qubdi/config';
import {
    clearRemoteId,
    getRemoteId,
    setProjectId,
    setRemoteId,
} from '@/lib/qubdi/remote-map';
import { claimLocalData, clearLocalUserData } from '@/lib/qubdi/local-data';
import { getBaseUpdatedAt, setBaseUpdatedAt } from '@/lib/qubdi/remote-version';
import {
    confirmSentContent,
    markSyncedContent,
    rememberSentContent,
} from '@/lib/qubdi/sent-content';
import { resetAdminLanding } from '@/lib/qubdi/admin-landing';
import {
    flushPendingSave,
    hasUnsavedChanges,
} from '@/lib/qubdi/save-status-store';
import { i18n } from '@/i18n/i18n';
import { diagramToServerContent } from '@/lib/qubdi/content';
import type { Diagram } from '@/lib/domain/diagram';

export const QubdiProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [user, setUser] = useState<RemoteUser | null | undefined>(
        QUBDI_BACKEND_ENABLED ? undefined : null
    );

    const [sessionEnded, setSessionEnded] = useState(false);
    const signedIn = useRef(false);
    signedIn.current = !!user;

    // Makes `next` the signed-in person. If the diagrams in this browser are
    // another account's (a session ended, or someone signed in without signing
    // out), they are cleared and the page reloads, so nobody sees them.
    const adopt = useCallback(async (next: RemoteUser) => {
        if (await claimLocalData(next.id)) {
            window.location.reload();
            return;
        }
        setUser(next);
    }, []);

    useEffect(() => {
        if (!QUBDI_BACKEND_ENABLED) return;
        api.me()
            .then(adopt)
            .catch(() => setUser(null));
    }, [adopt]);

    // the server refused a signed-in request as signed out: say so, instead of
    // leaving the user with pages that quietly stop working
    useEffect(() => {
        if (!QUBDI_BACKEND_ENABLED) return;
        setSessionEndedHandler(() => {
            if (!signedIn.current) return;
            setSessionEnded(true);
            setUser(null);
        });
        return () => setSessionEndedHandler(null);
    }, []);

    const login = useCallback(
        async (email: string, password: string) => {
            const result = await api.login(email, password);
            // password right, a code still to come: no session yet
            if ('mfaRequired' in result)
                return { mfaChallenge: result.challenge };
            await adopt(result);
            setSessionEnded(false);
        },
        [adopt]
    );

    const loginMfa = useCallback(
        async (challenge: string, factor: SecondFactor) => {
            await adopt(await api.loginMfa(challenge, factor));
            setSessionEnded(false);
        },
        [adopt]
    );

    const register = useCallback(
        async (email: string, password: string) => {
            await adopt(await api.register(email, password));
            setSessionEnded(false);
        },
        [adopt]
    );

    const logout = useCallback(async () => {
        // send the last edits while the session still works: after sign-out
        // they would get a 401, and the local copy holding them is deleted below
        await flushPendingSave();
        // an edit the server refused is still only in the local copy, which
        // is deleted below: let the person decide before it is gone
        if (
            hasUnsavedChanges() &&
            !window.confirm(i18n.t('qubdi.account.accountMenu.signOutUnsaved'))
        ) {
            return;
        }
        await api.logout().catch(() => undefined);
        resetAdminLanding();
        setSessionEnded(false);
        setUser(null);
        // the next person on this browser must not find this one's diagrams;
        // the reload drops what the page still holds in memory
        await clearLocalUserData();
        window.location.replace('/');
    }, []);

    const refreshUser = useCallback(async () => {
        setUser(await api.me());
    }, []);

    const syncDiagram = useCallback(
        async (
            diagram: Diagram,
            projectId?: string,
            options?: RequestOptions
        ) => {
            const content = diagramToServerContent(diagram);
            const remoteId = getRemoteId(diagram.id);
            if (remoteId) {
                try {
                    // A copy that predates conflict checking has no base yet:
                    // adopt the server's current one, once.
                    const base =
                        getBaseUpdatedAt(diagram.id) ??
                        (await api.getDiagram(remoteId)).updatedAt;
                    rememberSentContent(diagram.id, content);
                    const updated = await api.updateDiagram(
                        remoteId,
                        {
                            title: diagram.name,
                            content,
                            baseUpdatedAt: base,
                            editorId: getEditorId(),
                        },
                        options
                    );
                    setBaseUpdatedAt(diagram.id, updated.updatedAt);
                    confirmSentContent(diagram.id, content);
                    markSyncedContent(diagram.id, content);
                    return updated.id;
                } catch (e) {
                    // deleted or access revoked on the server: re-create it, but
                    // only when a project is known. Without one, keep the id so
                    // the real error surfaces instead of a later `no_project`.
                    if (
                        !(e instanceof ApiError) ||
                        e.status !== 404 ||
                        !projectId
                    )
                        throw e;
                    clearRemoteId(diagram.id);
                }
            }
            // nothing exists outside a project
            if (!projectId) throw new ApiError(400, 'no_project');
            const created = await api.createDiagram(
                diagram.name,
                content,
                projectId
            );
            setRemoteId(diagram.id, created.id);
            setBaseUpdatedAt(diagram.id, created.updatedAt);
            markSyncedContent(diagram.id, content);
            setProjectId(diagram.id, projectId);
            return created.id;
        },
        []
    );

    const value = useMemo<QubdiContext>(
        () => ({
            enabled: QUBDI_BACKEND_ENABLED,
            user,
            sessionEnded,
            login,
            loginMfa,
            register,
            logout,
            refreshUser,
            syncDiagram,
            remoteIdFor: getRemoteId,
        }),
        [
            user,
            sessionEnded,
            login,
            loginMfa,
            register,
            logout,
            refreshUser,
            syncDiagram,
        ]
    );

    return (
        <qubdiContext.Provider value={value}>{children}</qubdiContext.Provider>
    );
};
