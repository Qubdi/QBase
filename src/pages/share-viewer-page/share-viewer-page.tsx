import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Background,
    Controls,
    MiniMap,
    Panel,
    ReactFlow,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PoweredByMark } from '@/components/qubdi/powered-by';
import { Input } from '@/components/input/input';
import { Button } from '@/components/button/button';
import { AuthDialog } from '@/components/qubdi/auth-dialog';
import { useQubdi } from '@/hooks/use-qubdi';
import { api, type PublicShare } from '@/lib/qubdi/api';
import { QUBDI_BACKEND_URL } from '@/lib/qubdi/config';
import {
    buildViewerGraph,
    edgeTouches,
    relatedTableIds,
    searchTables,
} from '@/lib/qubdi/viewer-model';
import { ViewerTableNode } from './viewer-table-node';

type LoadState =
    | { kind: 'loading' }
    | { kind: 'ok'; share: PublicShare }
    | { kind: 'login_required' }
    | { kind: 'not_found' }
    | { kind: 'not_published' }
    | { kind: 'error' };

const nodeTypes = { viewerTable: ViewerTableNode };

const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

/**
 * Read-only view of a published diagram. It deliberately renders no editing UI
 * and uses none of the editor's providers.
 */
export const ShareViewerPage: React.FC = () => {
    const { t: tr } = useTranslation();
    const { token = '' } = useParams<{ token: string }>();
    const { user } = useQubdi();
    const [state, setState] = useState<LoadState>({ kind: 'loading' });
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [authOpen, setAuthOpen] = useState(false);

    // replies can arrive out of order: only the newest request may set the state
    const newestLoad = useRef(0);
    const load = useCallback(async () => {
        const request = ++newestLoad.current;
        const res = await api.getPublicShare(token);
        if (request !== newestLoad.current) return;
        if (res.status === 'ok') {
            setState({ kind: 'ok', share: res.share });
        } else {
            // a reload that failed (a dropped connection, a timeout) must not
            // blank a diagram that is already on screen
            setState((prev) =>
                res.status === 'error' && prev.kind === 'ok'
                    ? prev
                    : { kind: res.status }
            );
        }
    }, [token]);

    // reload when the visitor signs in (signed_in links)
    useEffect(() => {
        void load();
    }, [load, user?.id]);

    const live = state.kind === 'ok' && state.share.live;
    useEffect(() => {
        if (!live) return;
        let source: EventSource | null = null;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let delay = RECONNECT_MIN_MS;
        // versions published while the stream was down are never replayed
        let missed = false;
        const connect = () => {
            const next = new EventSource(
                `${QUBDI_BACKEND_URL}/s/${encodeURIComponent(token)}/events`,
                { withCredentials: true }
            );
            source = next;
            next.addEventListener('version', () => void load());
            next.addEventListener('open', () => {
                delay = RECONNECT_MIN_MS;
                if (missed) {
                    missed = false;
                    void load();
                }
            });
            next.addEventListener('error', () => {
                missed = true;
                // the browser reconnects a dropped stream by itself, but gives
                // up for good on an error reply such as 429: open a new one
                if (next.readyState !== EventSource.CLOSED) return;
                next.close();
                retry = setTimeout(connect, delay);
                delay = Math.min(delay * 2, RECONNECT_MAX_MS);
            });
        };
        connect();
        return () => {
            clearTimeout(retry);
            source?.close();
        };
    }, [live, token, load]);

    const graph = useMemo(
        () =>
            state.kind === 'ok'
                ? buildViewerGraph(state.share.content)
                : { tables: [], edges: [] },
        [state]
    );

    // a reload can remove the selected table: nothing is selected then
    const activeId = useMemo(
        () =>
            selectedId && graph.tables.some((t) => t.id === selectedId)
                ? selectedId
                : null,
        [graph.tables, selectedId]
    );
    useEffect(() => {
        if (selectedId && activeId === null) {
            setSelectedId(null);
        }
    }, [selectedId, activeId]);

    const matches = useMemo(
        () => searchTables(graph.tables, query),
        [graph.tables, query]
    );
    const related = useMemo(
        () => (activeId ? relatedTableIds(graph.edges, activeId) : null),
        [graph.edges, activeId]
    );

    const positions = useMemo(
        () => new Map(graph.tables.map((t) => [t.id, t.x])),
        [graph.tables]
    );

    const nodes: Node[] = useMemo(
        () =>
            graph.tables.map((t) => ({
                id: t.id,
                type: 'viewerTable',
                position: { x: t.x, y: t.y },
                draggable: false,
                connectable: false,
                data: {
                    table: t,
                    selected: t.id === activeId,
                    matched: matches?.has(t.id) ?? false,
                    dimmed:
                        (related !== null && !related.has(t.id)) ||
                        (related === null &&
                            matches !== null &&
                            !matches.has(t.id)),
                },
            })),
        [graph.tables, activeId, matches, related]
    );

    const edges: Edge[] = useMemo(
        () =>
            graph.edges.map((e) => {
                const active = activeId ? edgeTouches(e, activeId) : false;
                const sourceX = positions.get(e.source) ?? 0;
                const targetX = positions.get(e.target) ?? 0;
                const sourceOnRight = sourceX >= targetX;
                return {
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    sourceHandle: sourceOnRight ? 'sl' : 'sr',
                    targetHandle: sourceOnRight ? 'tr' : 'tl',
                    type: 'smoothstep',
                    animated: active,
                    style: {
                        strokeWidth: active ? 3 : 1.5,
                        opacity: activeId && !active ? 0.15 : 1,
                    },
                };
            }),
        [graph.edges, activeId, positions]
    );

    if (state.kind === 'loading') {
        return (
            <Centered>
                <p>{tr('qubdi.workspace.viewerPage.loading')}</p>
            </Centered>
        );
    }
    if (state.kind === 'not_published') {
        return (
            <Centered>
                <h1 className="text-xl font-semibold">
                    {tr('qubdi.workspace.viewerPage.notPublishedTitle')}
                </h1>
                <p className="text-muted-foreground">
                    {tr('qubdi.workspace.viewerPage.notPublishedDetail')}
                </p>
            </Centered>
        );
    }
    if (state.kind === 'not_found') {
        return (
            <Centered>
                <h1 className="text-xl font-semibold">
                    {tr('qubdi.workspace.viewerPage.notFoundTitle')}
                </h1>
                <p className="text-muted-foreground">
                    {tr('qubdi.workspace.viewerPage.notFoundDetail')}
                </p>
            </Centered>
        );
    }
    if (state.kind === 'login_required') {
        return (
            <Centered>
                <h1 className="text-xl font-semibold">
                    {tr('qubdi.workspace.viewerPage.loginTitle')}
                </h1>
                <p className="text-muted-foreground">
                    {tr('qubdi.workspace.viewerPage.loginDetail')}
                </p>
                <Button onClick={() => setAuthOpen(true)}>
                    {tr('qubdi.workspace.viewerPage.signIn')}
                </Button>
                <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
            </Centered>
        );
    }
    if (state.kind === 'error') {
        return (
            <Centered>
                <p>{tr('qubdi.workspace.viewerPage.error')}</p>
                <Button onClick={() => void load()}>
                    {tr('qubdi.workspace.viewerPage.retry')}
                </Button>
            </Centered>
        );
    }

    const { share } = state;
    return (
        <div
            className="flex h-screen w-screen flex-col"
            data-testid="viewer-readonly"
        >
            <header className="flex items-center gap-3 border-b px-4 py-2">
                <span className="font-semibold tracking-tight">QBase</span>
                <span className="truncate" data-testid="viewer-title">
                    {share.title}
                </span>
                <span className="text-xs text-muted-foreground">
                    {tr(
                        share.live
                            ? 'qubdi.workspace.viewerPage.statusLive'
                            : 'qubdi.workspace.viewerPage.status',
                        { version: share.version }
                    )}
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <div className="w-64">
                        <Input
                            type="search"
                            placeholder={tr(
                                'qubdi.workspace.viewerPage.search'
                            )}
                            aria-label={tr('qubdi.workspace.viewerPage.search')}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                </div>
            </header>
            <div className="relative flex min-h-0 flex-1">
                <div className="min-w-0 flex-1">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        edgesFocusable={false}
                        elementsSelectable
                        fitView
                        minZoom={0.1}
                        onNodeClick={(_, node) =>
                            setSelectedId((cur) =>
                                cur === node.id ? null : node.id
                            )
                        }
                        onPaneClick={() => setSelectedId(null)}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background />
                        <Controls showInteractive={false} />
                        <MiniMap pannable zoomable />
                        <Panel position="bottom-center">
                            <PoweredByMark />
                        </Panel>
                    </ReactFlow>
                </div>
            </div>
        </div>
    );
};

const Centered: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 p-6 text-center">
        {children}
    </div>
);
