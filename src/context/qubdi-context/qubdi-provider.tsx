import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { qubdiContext, type QubdiContext } from './qubdi-context';
import { api, ApiError, type RemoteUser } from '@/lib/qubdi/api';
import { QUBDI_BACKEND_ENABLED } from '@/lib/qubdi/config';
import {
    clearRemoteId,
    getRemoteId,
    setRemoteId,
} from '@/lib/qubdi/remote-map';
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
        setUser(null);
    }, []);

    const syncDiagram = useCallback(async (diagram: Diagram) => {
        const content = diagramToServerContent(diagram);
        const remoteId = getRemoteId(diagram.id);
        if (remoteId) {
            try {
                const updated = await api.updateDiagram(remoteId, {
                    title: diagram.name,
                    content,
                });
                return updated.id;
            } catch (e) {
                // deleted or access revoked on the server: fall through and re-create
                if (!(e instanceof ApiError) || e.status !== 404) throw e;
                clearRemoteId(diagram.id);
            }
        }
        const created = await api.createDiagram(diagram.name, content);
        setRemoteId(diagram.id, created.id);
        return created.id;
    }, []);

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
