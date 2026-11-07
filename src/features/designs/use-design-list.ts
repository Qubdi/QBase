import { useCallback, useEffect, useState } from 'react';
import type {
    DiagramSummary,
    StorageAdapter,
} from '@/persistence/storage-adapter';

/** The stored designs, newest change first; refreshes when the list changes. */
export function useDesignList(adapter: StorageAdapter, active = true) {
    const [items, setItems] = useState<DiagramSummary[] | undefined>();
    const reload = useCallback(async () => {
        try {
            setItems(await adapter.list());
        } catch {
            setItems([]);
        }
    }, [adapter]);

    useEffect(() => {
        if (!active) return;
        void reload();
        return adapter.onChange(() => void reload());
    }, [adapter, active, reload]);

    return { items, reload };
}
