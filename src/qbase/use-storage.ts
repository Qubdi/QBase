import { useContext } from 'react';
import { StorageContext } from './storage-context';
import type { LocalDiagrams } from './storage-context';

/** Local diagram copies: add, delete, list and get (spec C7). */
export function useStorage(): LocalDiagrams {
    const value = useContext(StorageContext);
    if (!value) throw new Error('No storage: wrap the page in StorageProvider');
    return value.diagrams;
}
