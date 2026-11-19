import React, { useEffect, useRef, useState } from 'react';
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
import { restorePendingCopy } from '@/persistence/pending-copy';
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
 * the browser's default diagram; with no usable default it opens nothing and the
 * fallback (the start flow) asks which to open.
 */
export const DiagramProvider: React.FC<
    React.PropsWithChildren<DiagramProviderProps>
> = ({ readonly, fallback = null, children }) => {
    const adapter = useStorageAdapter();
    const routeId = useEditorDiagramId();
    const workspace = useWorkspace();
    const { toast } = useToast();
    const { t } = useTranslation();
    // what was found, and for which adapter, id and workspace; an answer for
    // other inputs is not shown, so a change of any of them shows the spinner
    const [answer, setAnswer] = useState<{
        adapter: typeof adapter;
        routeId: typeof routeId;
        workspace: typeof workspace;
        loaded: Loaded;
    } | null>(null);
    const loaded: Loaded =
        answer &&
        answer.adapter === adapter &&
        answer.routeId === routeId &&
        answer.workspace === workspace
            ? answer.loaded
            : { status: 'loading' };
    const [openId, setOpenId] = useState<string | undefined>();

    // read by the load below without making a toggle of it load the diagram again
    const readonlyRef = useRef(readonly);
    useEffect(() => {
        readonlyRef.current = readonly;
    }, [readonly]);

    useEffect(() => {
        let cancelled = false;
        const settle = (next: Loaded) =>
            setAnswer({ adapter, routeId, workspace, loaded: next });
        void (async () => {
            // inside a project workspace with no local copy there is nothing to
            // open: the browser's own default diagram is not that project's.
            // With no usable default the start flow asks which to open (spec A3)
            const id =
                routeId ??
                (workspace
                    ? undefined
                    : (await adapter.readSettings()).defaultDiagramId ||
                      undefined);
            const stored = id ? await adapter.load(id) : undefined;
            if (cancelled) return;
            // Edits made in the last moments before the page was left may not have
            // reached IndexedDB; a copy kept as it was left is newer, and wins.
            const found =
                id && stored
                    ? await restorePendingCopy(
                          // a read-only session never writes (spec C2): it shows the copy only
                          readonlyRef.current ? undefined : adapter,
                          id,
                          stored
                      )
                    : stored;
            if (cancelled) return;
            if (!id || !found) return settle({ status: 'missing' });
            const filter = await adapter.readFilter(id);
            if (cancelled) return;
            setOpenId(id);
            settle({
                status: 'ready',
                design: found.design,
                warnings: found.warnings,
                filter,
            });
        })().catch(() => !cancelled && settle({ status: 'missing' }));
        return () => {
            cancelled = true;
        };
    }, [adapter, routeId, workspace]);

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
