import React from 'react';
import { MessageSquare } from 'lucide-react';
import { commentsStore, useTargetSummary } from '@/lib/qubdi/comments-store';
import type { CommentTargetType } from '@/lib/qubdi/comments-model';

export interface CommentMarkerProps {
    type: CommentTargetType;
    id: string;
}

/** Small badge shown on a table or field that has comments. Renders nothing otherwise. */
export const CommentMarker: React.FC<CommentMarkerProps> = ({ type, id }) => {
    const summary = useTargetSummary(type, id);
    if (!summary) return null;
    const label =
        summary.open > 0
            ? `${summary.open} open comment${summary.open === 1 ? '' : 's'}`
            : `${summary.total} resolved comment${summary.total === 1 ? '' : 's'}`;
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            data-testid="comment-marker"
            className={[
                'nodrag nopan flex shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-semibold leading-4',
                summary.open > 0
                    ? 'bg-amber-400 text-black'
                    : 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
            ].join(' ')}
            onClick={(e) => {
                e.stopPropagation();
                commentsStore.openPanel({ type, id });
            }}
        >
            <MessageSquare className="size-2.5" />
            {summary.open > 0 ? summary.open : '✓'}
        </button>
    );
};
