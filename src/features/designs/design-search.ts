import type { DiagramSummary } from '@/persistence/storage-adapter';

/** Whether the diagram's name contains the search text (case does not matter). */
export const matchesSearch = (
    item: Pick<DiagramSummary, 'name'>,
    search: string
): boolean => item.name.toLowerCase().includes(search.trim().toLowerCase());
