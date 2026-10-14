import { createContext, useContext } from 'react';
import { useParams } from 'react-router-dom';
import type { MyProject } from '@/lib/qubdi/api';

/** The project the editor is open in (`/<project>/diagrams/...`). */
export interface Workspace {
    project: MyProject;
    /** the diagram's copy in this browser; undefined on /<project>/diagrams */
    localDiagramId: string | undefined;
    /** the diagram's id on the server */
    remoteDiagramId: string | undefined;
}

export const WorkspaceContext = createContext<Workspace | null>(null);

/** null outside a project workspace (local mode, or an old /diagrams/<id> link). */
export const useWorkspace = () => useContext(WorkspaceContext);

/**
 * The id of the diagram the editor works on, in the browser's own storage.
 * Inside a workspace it comes from resolving the URL; otherwise from the
 * /diagrams/:diagramId route.
 */
export function useEditorDiagramId(): string | undefined {
    const workspace = useWorkspace();
    const { diagramId } = useParams<{ diagramId: string }>();
    return workspace ? workspace.localDiagramId : diagramId;
}
