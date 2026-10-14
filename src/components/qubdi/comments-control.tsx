import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/button/button';
import { useChartDB } from '@/hooks/use-chartdb';
import { useQubdi } from '@/hooks/use-qubdi';
import { api, errorMessage } from '@/lib/qubdi/api';
import {
    commentsStore,
    useCommentsState,
    type EditorComment,
} from '@/lib/qubdi/comments-store';
import {
    describeTarget,
    targetKey,
    targetOptions,
} from '@/lib/qubdi/comments-model';
import { buildViewerGraph } from '@/lib/qubdi/viewer-model';

/** Toolbar button plus the editor's comments panel. Only active when signed in. */
export const CommentsControl: React.FC = () => {
    const { enabled, user, remoteIdFor, syncDiagram } = useQubdi();
    const { currentDiagram } = useChartDB();
    const state = useCommentsState();
    const remoteId = remoteIdFor(currentDiagram.id);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [pick, setPick] = useState('');
    const [hideResolved, setHideResolved] = useState(false);
    const [editing, setEditing] = useState<{ id: string; body: string } | null>(
        null
    );

    const refresh = useCallback(async () => {
        if (!remoteId) {
            commentsStore.setComments([]);
            return;
        }
        try {
            commentsStore.setComments(await api.listComments(remoteId));
            setError(null);
        } catch (e) {
            setError(errorMessage(e));
        }
    }, [remoteId]);

    useEffect(() => {
        if (!user) {
            commentsStore.reset();
            return;
        }
        void refresh();
    }, [user, refresh, currentDiagram.id, state.panelOpen]);

    const graph = useMemo(
        () => buildViewerGraph(currentDiagram),
        [currentDiagram]
    );
    const options = useMemo(() => targetOptions(graph), [graph]);

    if (!enabled || !user) return null;

    const run = async (fn: (id: string) => Promise<unknown>) => {
        setError(null);
        try {
            // comments attach to the server copy, so make sure it is current
            const id = await syncDiagram(currentDiagram);
            await fn(id);
            commentsStore.setComments(await api.listComments(id));
        } catch (e) {
            setError(errorMessage(e));
        }
    };

    const visible = state.comments.filter((c) => !(hideResolved && c.resolved));

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="gap-1"
                aria-pressed={state.panelOpen}
                onClick={() =>
                    state.panelOpen
                        ? commentsStore.closePanel()
                        : commentsStore.openPanel()
                }
            >
                <MessageSquare className="size-4" />
                Comments
                {state.comments.length > 0 ? ` (${state.comments.length})` : ''}
            </Button>
            {state.panelOpen ? (
                <aside
                    aria-label="Comments"
                    data-testid="comments-panel"
                    className="fixed bottom-3 right-3 top-14 z-50 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col gap-3 overflow-y-auto rounded-md border bg-background p-3 text-sm shadow-lg"
                >
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold">Comments</h2>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                onClick={commentsStore.toggleMarkers}
                            >
                                {state.showMarkers ? (
                                    <EyeOff className="size-4" />
                                ) : (
                                    <Eye className="size-4" />
                                )}
                                {state.showMarkers
                                    ? 'Hide markers'
                                    : 'Show markers'}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Close comments"
                                onClick={commentsStore.closePanel}
                            >
                                <X className="size-4" />
                            </Button>
                        </div>
                    </div>

                    <form
                        className="flex flex-col gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const opt = options.find(
                                (o) => targetKey(o.type, o.id) === pick
                            );
                            if (!opt || !draft.trim()) return;
                            void run(async (id) => {
                                await api.addComment(id, {
                                    targetType: opt.type,
                                    targetId: opt.id,
                                    body: draft.trim(),
                                });
                                setDraft('');
                            });
                        }}
                    >
                        <select
                            aria-label="Comment target"
                            className="h-9 rounded-md border border-input bg-background px-2"
                            value={pick}
                            onChange={(e) => setPick(e.target.value)}
                            required
                        >
                            <option value="">
                                Choose a table, field or relationship…
                            </option>
                            {options.map((o) => (
                                <option
                                    key={targetKey(o.type, o.id)}
                                    value={targetKey(o.type, o.id)}
                                >
                                    {o.type === 'table'
                                        ? `Table · ${o.label}`
                                        : o.type === 'field'
                                          ? `Field · ${o.label}`
                                          : `Relationship · ${o.label}`}
                                </option>
                            ))}
                        </select>
                        <textarea
                            aria-label="New comment"
                            className="min-h-16 rounded-md border border-input bg-background p-2"
                            placeholder="Write a comment…"
                            maxLength={2000}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                        />
                        <Button type="submit" size="sm">
                            Add comment
                        </Button>
                    </form>

                    <label className="flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={hideResolved}
                            onChange={(e) => setHideResolved(e.target.checked)}
                        />
                        Hide resolved
                    </label>

                    {error ? (
                        <p role="alert" className="text-red-500">
                            {error}
                        </p>
                    ) : null}

                    <ul className="flex flex-col gap-2">
                        {visible.length === 0 ? (
                            <li className="text-muted-foreground">
                                No comments yet.
                            </li>
                        ) : null}
                        {visible.map((c) => (
                            <CommentItem
                                key={c.id}
                                comment={c}
                                label={
                                    describeTarget(
                                        graph,
                                        c.targetType,
                                        c.targetId
                                    ) ?? '(removed from diagram)'
                                }
                                focused={
                                    state.focus?.type === c.targetType &&
                                    state.focus.id === c.targetId
                                }
                                editing={editing?.id === c.id ? editing : null}
                                setEditing={setEditing}
                                onSave={(body) =>
                                    run(async (id) => {
                                        await api.updateComment(id, c.id, body);
                                        setEditing(null);
                                    })
                                }
                                onResolve={() =>
                                    run((id) =>
                                        api.resolveComment(
                                            id,
                                            c.id,
                                            !c.resolved
                                        )
                                    )
                                }
                                onDelete={() =>
                                    run((id) => api.deleteComment(id, c.id))
                                }
                            />
                        ))}
                    </ul>
                </aside>
            ) : null}
        </>
    );
};

interface CommentItemProps {
    comment: EditorComment;
    label: string;
    focused: boolean;
    editing: { id: string; body: string } | null;
    setEditing: (e: { id: string; body: string } | null) => void;
    onSave: (body: string) => void;
    onResolve: () => void;
    onDelete: () => void;
}

const CommentItem: React.FC<CommentItemProps> = ({
    comment: c,
    label,
    focused,
    editing,
    setEditing,
    onSave,
    onResolve,
    onDelete,
}) => (
    <li
        data-testid="comment-item"
        className={[
            'flex flex-col gap-1 rounded-md border p-2',
            focused ? 'ring-2 ring-primary' : '',
            c.resolved ? 'opacity-60' : '',
        ].join(' ')}
    >
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{label}</span>
            <span>· {c.targetType}</span>
            {c.orphaned ? (
                <span className="rounded bg-red-100 px-1 text-red-800 dark:bg-red-900 dark:text-red-200">
                    orphaned
                </span>
            ) : null}
            {c.resolved ? <span>· resolved</span> : null}
        </div>
        {editing ? (
            <>
                <textarea
                    aria-label="Edit comment"
                    className="min-h-14 rounded-md border border-input bg-background p-2"
                    maxLength={2000}
                    value={editing.body}
                    onChange={(e) =>
                        setEditing({ id: c.id, body: e.target.value })
                    }
                />
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        onClick={() =>
                            editing.body.trim() && onSave(editing.body)
                        }
                    >
                        Save
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(null)}
                    >
                        Cancel
                    </Button>
                </div>
            </>
        ) : (
            <p className="whitespace-pre-wrap break-words">{c.body}</p>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
                {c.authorEmail ?? 'unknown'} ·{' '}
                {new Date(c.createdAt).toLocaleDateString()}
            </span>
            {editing ? null : (
                <span className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={onResolve}>
                        {c.resolved ? 'Reopen' : 'Resolve'}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing({ id: c.id, body: c.body })}
                    >
                        Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onDelete}>
                        Delete
                    </Button>
                </span>
            )}
        </div>
    </li>
);
