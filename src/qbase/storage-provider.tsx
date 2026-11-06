import React, { useEffect, useMemo, useState } from 'react';
import { openStorage } from '@/persistence/open-storage';
import type { StorageAdapter } from '@/persistence/storage-adapter';
import { localDiagramsOver } from './local-diagrams';
import { StorageContext } from './storage-context';
import type { StorageValue } from './storage-context';

/**
 * Opens the browser's database once and shares it with the page. Opening
 * merges the earlier `QubdiDB` database first and moves the old layout (see
 * `@/persistence`); when the browser blocks IndexedDB, copies live in memory
 * so the page still opens. Children render when the storage is ready.
 */
export const StorageProvider: React.FC<
    React.PropsWithChildren<{ adapter?: StorageAdapter }>
> = ({ adapter: given, children }) => {
    const [adapter, setAdapter] = useState<StorageAdapter | undefined>(given);

    useEffect(() => {
        if (given) return;
        let cancelled = false;
        void openStorage().then((opened) => {
            if (!cancelled) setAdapter(opened.adapter);
        });
        return () => {
            cancelled = true;
        };
    }, [given]);

    const value = useMemo<StorageValue | null>(
        () =>
            adapter ? { adapter, diagrams: localDiagramsOver(adapter) } : null,
        [adapter]
    );

    if (!value) return null;
    return (
        <StorageContext.Provider value={value}>
            {children}
        </StorageContext.Provider>
    );
};
