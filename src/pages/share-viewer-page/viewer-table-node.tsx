import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { KeyRound, MessageSquare } from 'lucide-react';
import type { ViewerTable } from '@/lib/qubdi/viewer-model';

export interface ViewerTableNodeData extends Record<string, unknown> {
    table: ViewerTable;
    dimmed: boolean;
    selected: boolean;
    matched: boolean;
    /** open comments on the table itself */
    tableComments: number;
    /** open comments per field id */
    fieldComments: Record<string, number>;
}

const hiddenHandle = { opacity: 0, pointerEvents: 'none' as const };

const Badge: React.FC<{ count: number }> = ({ count }) => (
    <span
        data-testid="viewer-comment-marker"
        title={`${count} comment${count === 1 ? '' : 's'}`}
        className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold leading-4 text-black"
    >
        <MessageSquare className="size-2.5" />
        {count}
    </span>
);

export const ViewerTableNode: React.FC<NodeProps> = ({ data }) => {
    const { table, dimmed, selected, matched, tableComments, fieldComments } =
        data as unknown as ViewerTableNodeData;
    return (
        <div
            data-testid={`viewer-table-${table.name}`}
            className={[
                'w-[260px] overflow-hidden rounded-md border bg-background text-sm shadow-xs transition-opacity',
                dimmed ? 'opacity-25' : 'opacity-100',
                selected ? 'ring-2 ring-primary' : '',
                matched ? 'ring-2 ring-yellow-400' : '',
            ].join(' ')}
        >
            {/* one handle per side so edges can leave towards the other table */}
            <Handle
                id="tl"
                type="target"
                position={Position.Left}
                style={hiddenHandle}
            />
            <Handle
                id="tr"
                type="target"
                position={Position.Right}
                style={hiddenHandle}
            />
            <Handle
                id="sl"
                type="source"
                position={Position.Left}
                style={hiddenHandle}
            />
            <Handle
                id="sr"
                type="source"
                position={Position.Right}
                style={hiddenHandle}
            />
            <div
                className="flex items-center justify-between gap-2 px-3 py-2 font-semibold text-black"
                style={{ backgroundColor: table.color }}
            >
                <span className="truncate">
                    {table.schema ? `${table.schema}.` : ''}
                    {table.name}
                    {table.isView ? ' (view)' : ''}
                </span>
                {tableComments > 0 ? <Badge count={tableComments} /> : null}
            </div>
            <ul className="max-h-[320px] divide-y overflow-y-auto">
                {table.fields.map((f) => (
                    <li
                        key={f.id}
                        className="flex items-center justify-between gap-2 px-3 py-1"
                    >
                        <span className="flex min-w-0 items-center gap-1">
                            {f.primaryKey ? (
                                <KeyRound className="size-3 shrink-0 text-yellow-500" />
                            ) : null}
                            <span className="truncate">{f.name}</span>
                            {fieldComments[f.id] ? (
                                <Badge count={fieldComments[f.id]} />
                            ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {f.type}
                            {f.nullable ? '' : ' •'}
                        </span>
                    </li>
                ))}
                {table.fields.length === 0 ? (
                    <li className="px-3 py-1 text-xs text-muted-foreground">
                        No fields
                    </li>
                ) : null}
            </ul>
        </div>
    );
};
