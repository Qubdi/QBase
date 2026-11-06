import { createContext, useContext } from 'react';
import type { StorageAdapter } from '@/persistence/storage-adapter';
import type { Diagram } from './diagram-types';

/** The browser's own copies of diagrams, in the saved shape (spec C7). */
export interface LocalDiagrams {
    addDiagram: (args: { diagram: Diagram }) => Promise<void>;
    deleteDiagram: (id: string) => Promise<void>;
    listDiagrams: () => Promise<
        { id: string; name: string; updatedAt: number }[]
    >;
    getDiagram: (id: string) => Promise<Diagram | undefined>;
}

export interface StorageValue {
    adapter: StorageAdapter;
    diagrams: LocalDiagrams;
}

export const StorageContext = createContext<StorageValue | null>(null);

/** The storage adapter of the page, or null outside a `StorageProvider`. */
export function useStorageAdapter(): StorageAdapter {
    const value = useContext(StorageContext);
    if (!value) throw new Error('No storage: wrap the page in StorageProvider');
    return value.adapter;
}
