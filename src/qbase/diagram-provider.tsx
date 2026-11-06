import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/platform/ui/spinner';
import { useToast } from '@/platform/toast/use-toast';
import {
    useEditorDiagramId,
    useWorkspace,
} from '@/components/qubdi/workspace-context';
import type { Design } from '@/core/model/design';
import type { VisibilityFilter } from '@/core/model/visibility-filter';
import type { WireWarning } from '@/core/wire/warning';
import { EditorStoreProvider } from '@/store/editor-provider';
import { useStorageAdapter } from './storage-context';

type Loaded =
    | { status: 'loading' }
    | { status: 'missing' }
    | {
          status: 'ready';
          design: Design;
          warnings: WireWarning[];
          filter?: VisibilityFilter;
      };

export interface DiagramProviderProps {
    /** true refuses every edit and every write to local storage (spec C2) */
    readonly?: boolean;
    /** shown when there is no diagram to open (no id, or none stored under it) */
    fallback?: React.ReactNode;
}

/**
 * Loads the diagram of the page from local storage and holds it in an editor
 * store for everything below. Another diagram id starts a fresh store, so no
 * edit or history leaks across diagrams. With no id in the address it opens
 * the browser's default (or newest) diagram.
 */
export const DiagramProvider: React.FC<
    React.PropsWithChildren<DiagramProviderProps>
> = ({ readonly, fallback = null, children }) => {
    const adapter = useStorageAdapter();
    const routeId = useEditorDiagramId();
    const workspace = useWorkspace();
    const { toast } = useToast();
    const { t } = useTranslation();
    const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
    const [openId, setOpenId] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        setLoaded({ status: 'loading' });
        void (async () => {
            const id =
                routeId ??
                ((await adapter.readSettings()).defaultDiagramId ||
                    (await adapter.list())[0]?.id);
            const found = id ? await adapter.load(id) : undefined;
            if (cancelled) return;
            if (!id || !found) return setLoaded({ status: 'missing' });
            const filter = await adapter.readFilter(id);
            if (cancelled) return;
            setOpenId(id);
            setLoaded({
                status: 'ready',
                design: found.design,
                warnings: found.warnings,
                filter,
            });
        })().catch(() => !cancelled && setLoaded({ status: 'missing' }));
        return () => {
            cancelled = true;
        };
    }, [adapter, routeId]);

    if (loaded.status === 'loading')
        return (
            <div className="flex h-dvh w-dvw items-center justify-center">
                <Spinner size="large" className="text-primary" />
            </div>
        );
    if (loaded.status === 'missing' || !openId) return <>{fallback}</>;

    return (
        <EditorStoreProvider
            key={openId}
            design={loaded.design}
            warnings={loaded.warnings}
            filter={loaded.filter}
            readonly={readonly}
            adapter={adapter}
            location={{
                diagramId: openId,
                projectSlug: workspace?.project.slug,
                remoteDiagramId: workspace?.remoteDiagramId,
            }}
            onSaveError={() =>
                toast({
                    title: t('qubdi.workspace.autosave.notSaved'),
                    variant: 'destructive',
                })
            }
        >
            {children}
        </EditorStoreProvider>
    );
};
