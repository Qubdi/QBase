import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { qubdiContext, type QubdiContext } from './qubdi-context';
import {
    api,
    ApiError,
    type RemoteUser,
    type RequestOptions,
} from '@/lib/qubdi/api';
import { QUBDI_BACKEND_ENABLED } from '@/lib/qubdi/config';
import {
    clearRemoteId,
    getRemoteId,
    setProjectId,
    setRemoteId,
} from '@/lib/qubdi/remote-map';
import { getBaseUpdatedAt, setBaseUpdatedAt } from '@/lib/qubdi/remote-version';
import { resetAdminLanding } from '@/lib/qubdi/admin-landing';
import { diagramToServerContent } from '@/lib/qubdi/content';
import type { Diagram } from '@/lib/domain/diagram';

export const QubdiProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [user, setUser] = useState<RemoteUser | null | undefined>(
        QUBDI_BACKEND_ENABLED ? undefined : null
    );

    useEffect(() => {
        if (!QUBDI_BACKEND_ENABLED) return;
        api.me()
            .then(setUser)
            .catch(() => setUser(null));
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        setUser(await api.login(email, password));
    }, []);

    const register = useCallback(async (email: string, password: string) => {
        setUser(await api.register(email, password));
    }, []);

    const logout = useCallback(async () => {
        await api.logout().catch(() => undefined);
        resetAdminLanding();
        setUser(null);
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
                    const updated = await api.updateDiagram(
                        remoteId,
                        {
                            title: diagram.name,
                            content,
                            baseUpdatedAt: base,
                        },
                        options
                    );
                    setBaseUpdatedAt(diagram.id, updated.updatedAt);
                    return updated.id;
                } catch (e) {
                    // deleted or access revoked on the server: fall through and re-create
                    if (!(e instanceof ApiError) || e.status !== 404) throw e;
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
            setProjectId(diagram.id, projectId);
            return created.id;
        },
        []
    );

    const value = useMemo<QubdiContext>(
        () => ({
            enabled: QUBDI_BACKEND_ENABLED,
            user,
            login,
            register,
            logout,
            syncDiagram,
            remoteIdFor: getRemoteId,
        }),
        [user, login, register, logout, syncDiagram]
    );

    return (
        <qubdiContext.Provider value={value}>{children}</qubdiContext.Provider>
    );
};
