import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
} from 'react';
import { useReactFlow } from '@xyflow/react';
import type { Id } from '@/core/model/id';
import type { EditorStore } from '@/store/editor-store';
import { ZOOM_MIN } from '@/store/editor-state';
import { FIT_MAX_ZOOM, FIT_PADDING } from './geometry';

export const ZOOM_STEP_MS = 200;
export const FIT_MS = 500;
const FOCUS_MS = 400;

/** What the frame around the canvas may call (see `onReady`). */
export interface CanvasControls {
    fit(): void;
    zoomToIds(ids: string[]): void;
    /** the diagram point at the top-left corner of what is shown */
    viewportOrigin(): { x: number; y: number };
}

export interface ViewportControls extends CanvasControls {
    /** fit the drawn tables in view, 10% padding, at most 80% zoom */
    fit(options?: { instant?: boolean }): void;
    zoomIn(): void;
    zoomOut(): void;
    /** back to exactly 100% */
    resetZoom(): void;
    /** centre an entity at 100% */
    focusOn(id: Id): void;
}

/**
 * The camera of the canvas: the actions the toolbar, the shortcuts and the
 * side panel use. Zoom is kept inside the store's range.
 * `drawn` lists the ids of the nodes that fit should frame.
 */
export function useViewportControls(
    drawn: readonly Id[],
    store: EditorStore
): ViewportControls {
    const flow = useReactFlow();
    const drawnRef = useRef(drawn);
    // read when fit runs, from events; kept current after each commit
    useLayoutEffect(() => {
        drawnRef.current = drawn;
    });

    const fit = useCallback(
        (options?: { instant?: boolean }) => {
            const nodes = drawnRef.current.map((id) => ({ id }));
            void flow.fitView({
                nodes: nodes.length > 0 ? nodes : undefined,
                padding: FIT_PADDING,
                maxZoom: FIT_MAX_ZOOM,
                minZoom: ZOOM_MIN,
                duration: options?.instant ? 0 : FIT_MS,
            });
        },
        [flow]
    );

    const focusOn = useCallback(
        (id: Id) => {
            const node = flow.getNode(id);
            if (!node) return;
            const width = node.measured?.width ?? node.width ?? 224;
            const height = node.measured?.height ?? node.height ?? 100;
            void flow.setCenter(
                node.position.x + width / 2,
                node.position.y + height / 2,
                { zoom: 1, duration: FOCUS_MS }
            );
        },
        [flow]
    );

    // the side panel asks for a table to be shown: select it and bring it in
    const request = store.getState().ui.focus;
    const lastRequest = useRef(request?.request);
    useEffect(
        () =>
            store.subscribe((state, before) => {
                const next = state.ui.focus;
                if (!next || next.request === before.ui.focus?.request) return;
                if (next.request === lastRequest.current) return;
                lastRequest.current = next.request;
                state.select([next.entityId]);
                focusOn(next.entityId);
            }),
        [store, focusOn]
    );

    const zoomToIds = useCallback(
        (ids: Id[]) => {
            if (ids.length === 0) return;
            void flow.fitView({
                nodes: ids.map((id) => ({ id })),
                padding: FIT_PADDING,
                maxZoom: FIT_MAX_ZOOM,
                minZoom: ZOOM_MIN,
                duration: FIT_MS,
            });
        },
        [flow]
    );
    const viewportOrigin = useCallback(() => {
        const { x, y, zoom } = flow.getViewport();
        return { x: -x / zoom, y: -y / zoom };
    }, [flow]);

    return useMemo(
        () => ({
            fit,
            zoomToIds,
            viewportOrigin,
            zoomIn: () => void flow.zoomIn({ duration: ZOOM_STEP_MS }),
            zoomOut: () => void flow.zoomOut({ duration: ZOOM_STEP_MS }),
            resetZoom: () => void flow.zoomTo(1, { duration: ZOOM_STEP_MS }),
            focusOn,
        }),
        [flow, fit, focusOn, zoomToIds, viewportOrigin]
    );
}
