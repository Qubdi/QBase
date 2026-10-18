import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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

/**
 * Read-only view of a published diagram. It deliberately renders no editing UI
 * and uses none of the editor's providers.
 */
export const ShareViewerPage: React.FC = () => {
    const { token = '' } = useParams<{ token: string }>();
    const { user } = useQubdi();
    const [state, setState] = useState<LoadState>({ kind: 'loading' });
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [authOpen, setAuthOpen] = useState(false);

    const load = useCallback(async () => {
        const res = await api.getPublicShare(token);
        if (res.status === 'ok') {
            setState({ kind: 'ok', share: res.share });
        } else {
            setState({ kind: res.status });
        }
    }, [token]);

    // reload when the visitor signs in (signed_in links)
    useEffect(() => {
        void load();
    }, [load, user?.id]);

    const live = state.kind === 'ok' && state.share.live;
    useEffect(() => {
        if (!live) return;
        const source = new EventSource(
            `${QUBDI_BACKEND_URL}/s/${encodeURIComponent(token)}/events`,
            { withCredentials: true }
        );
        source.addEventListener('version', () => void load());
        return () => source.close();
    }, [live, token, load]);

    const graph = useMemo(
        () =>
            state.kind === 'ok'
                ? buildViewerGraph(state.share.content)
                : { tables: [], edges: [] },
        [state]
    );

    const matches = useMemo(
        () => searchTables(graph.tables, query),
        [graph.tables, query]
    );
    const related = useMemo(
        () => (selectedId ? relatedTableIds(graph.edges, selectedId) : null),
        [graph.edges, selectedId]
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
                    selected: t.id === selectedId,
                    matched: matches?.has(t.id) ?? false,
                    dimmed:
                        (related !== null && !related.has(t.id)) ||
                        (related === null &&
                            matches !== null &&
                            !matches.has(t.id)),
                },
            })),
        [graph.tables, selectedId, matches, related]
    );

    const edges: Edge[] = useMemo(
        () =>
            graph.edges.map((e) => {
                const active = selectedId ? edgeTouches(e, selectedId) : false;
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
                        opacity: selectedId && !active ? 0.15 : 1,
                    },
                };
            }),
        [graph.edges, selectedId, positions]
    );

    if (state.kind === 'loading') {
        return (
            <Centered>
                <p>Loading…</p>
            </Centered>
        );
    }
    if (state.kind === 'not_published') {
        return (
            <Centered>
                <h1 className="text-xl font-semibold">Not published yet</h1>
                <p className="text-muted-foreground">
                    The link works, but its owner has not published this diagram
                    yet. Try again later.
                </p>
            </Centered>
        );
    }
    if (state.kind === 'not_found') {
        return (
            <Centered>
                <h1 className="text-xl font-semibold">Link not available</h1>
                <p className="text-muted-foreground">
                    This link does not exist, has expired, or was revoked.
                </p>
            </Centered>
        );
    }
    if (state.kind === 'login_required') {
        return (
            <Centered>
                <h1 className="text-xl font-semibold">Sign in to view</h1>
                <p className="text-muted-foreground">
                    The owner restricted this diagram to signed-in users.
                </p>
                <Button onClick={() => setAuthOpen(true)}>Sign in</Button>
                <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
            </Centered>
        );
    }
    if (state.kind === 'error') {
        return (
            <Centered>
                <p>Could not load this diagram.</p>
                <Button onClick={() => void load()}>Retry</Button>
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
                <span className="font-semibold tracking-tight">QubdiDB</span>
                <span className="truncate" data-testid="viewer-title">
                    {share.title}
                </span>
                <span className="text-xs text-muted-foreground">
                    v{share.version}
                    {share.live ? ' · live' : ''} · read-only
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <div className="w-64">
                        <Input
                            type="search"
                            placeholder="Search tables and fields"
                            aria-label="Search tables and fields"
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
