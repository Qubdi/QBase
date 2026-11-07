import type React from 'react';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '@/components/qubdi/workspace-context';
import { useQubdi } from '@/hooks/use-qubdi';
import { useStorageAdapter } from '@/qbase/storage-context';
import { useEditorStore } from '@/store/store-context';

/**
 * Opening a diagram makes it the default (spec A3 step 5). In local mode a
 * bare `/` moves to the diagram's own address, so a reload or a shared link
 * lands on it.
 */
export const RememberDefault: React.FC = () => {
    const adapter = useStorageAdapter();
    const navigate = useNavigate();
    const workspace = useWorkspace();
    const { enabled } = useQubdi();
    const { diagramId } = useParams<{ diagramId: string }>();
    const id = useEditorStore((s) => s.design.id);

    useEffect(() => {
        void adapter
            .writeSettings({ defaultDiagramId: id })
            .catch(() => undefined);
        if (!enabled && !workspace && !diagramId)
            navigate(`/diagrams/${id}`, { replace: true });
    }, [adapter, id, enabled, workspace, diagramId, navigate]);

    return null;
};
