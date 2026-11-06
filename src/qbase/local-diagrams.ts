import type { StorageAdapter } from '@/persistence/storage-adapter';
import { designToDiagram, diagramToDesign } from './diagram-convert';
import type { LocalDiagrams } from './storage-context';

/** The local copies as QBase code sees them: whole saved-shape diagrams by id. */
export function localDiagramsOver(adapter: StorageAdapter): LocalDiagrams {
    return {
        addDiagram: ({ diagram }) =>
            adapter.save(diagramToDesign(diagram).design),
        deleteDiagram: (id) => adapter.remove(id),
        listDiagrams: () => adapter.list(),
        getDiagram: async (id) => {
            const loaded = await adapter.load(id);
            return loaded ? designToDiagram(loaded.design) : undefined;
        },
    };
}
