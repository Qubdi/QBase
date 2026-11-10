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
        const load = async () => {
            try {
                setItems(await adapter.list());
            } catch {
                setItems([]);
            }
        };
        void load();
        return adapter.onChange(() => void load());
    }, [adapter, active]);

    return { items, reload };
}
