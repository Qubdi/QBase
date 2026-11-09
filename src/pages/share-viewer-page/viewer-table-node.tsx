import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { KeyRound, Table2, View } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    FIELD_TYPE_KIND_CLASS,
    fieldTypeKind,
} from '@/features/tables/field-type-kind';
import { cn } from '@/lib/utils';
import type { ViewerTable } from '@/lib/qubdi/viewer-model';

export interface ViewerTableNodeData extends Record<string, unknown> {
    table: ViewerTable;
    dimmed: boolean;
    selected: boolean;
    matched: boolean;
}

const hiddenHandle = { opacity: 0, pointerEvents: 'none' as const };

export const ViewerTableNode: React.FC<NodeProps> = ({ data }) => {
    const { t } = useTranslation();
    const { table, dimmed, selected, matched } =
        data as unknown as ViewerTableNodeData;
    const subtitle = [
        table.schema,
        table.isView ? t('qubdi.workspace.viewerNode.view') : null,
    ]
        .filter(Boolean)
        .join(' · ');
    return (
        <div
            data-testid={`viewer-table-${table.name}`}
            className={[
                'w-[260px] overflow-hidden rounded-xl border bg-card text-sm shadow-xs transition-opacity',
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
            {/* the editor's table card, without its editing parts */}
            <div
                className="flex h-12 items-center gap-2.5 border-b px-3"
                style={{
                    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${table.color} 20%, transparent), color-mix(in srgb, ${table.color} 6%, transparent))`,
                }}
            >
                {table.isView ? (
                    <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-dashed"
                        style={{
                            borderColor: table.color,
                            color: table.color,
                        }}
                    >
                        <View className="size-4" />
                    </span>
                ) : (
                    <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: table.color }}
                    >
                        <Table2 className="size-4" />
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold leading-tight">
                        {table.name}
                    </div>
                    {subtitle ? (
                        <div className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                            {subtitle}
                        </div>
                    ) : null}
                </div>
                <span
                    className="shrink-0 rounded-full bg-background/70 px-1.5 text-[11px] font-semibold leading-4 tabular-nums text-muted-foreground"
                    title={t('qubdi.workspace.viewerNode.fieldCount', {
                        count: table.fields.length,
                    })}
                >
                    {table.fields.length}
                </span>
            </div>
            <ul className="max-h-[320px] overflow-y-auto">
                {table.fields.map((f) => (
                    <li
                        key={f.id}
                        className="flex h-8 items-center justify-between gap-1 border-t px-3 text-sm first:border-t-0"
                    >
                        <span className="flex size-4 shrink-0 items-center justify-center">
                            {f.primaryKey ? (
                                <KeyRound
                                    size={14}
                                    className="text-amber-500"
                                />
                            ) : null}
                        </span>
                        <span
                            className={cn(
                                'min-w-0 flex-1 truncate text-left',
                                (f.primaryKey || f.unique) && 'font-semibold'
                            )}
                        >
                            {f.name}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-1">
                            {f.unique && !f.primaryKey ? (
                                <span
                                    className="shrink-0 rounded-xs border px-1 text-[9px] font-semibold leading-3 text-muted-foreground"
                                    title={t(
                                        'qubdi.workspace.viewerNode.unique'
                                    )}
                                >
                                    {t(
                                        'qubdi.workspace.viewerNode.uniqueShort'
                                    )}
                                </span>
                            ) : null}
                            <span
                                className={cn(
                                    'min-w-0 overflow-hidden rounded-md px-1.5 py-0.5 text-right font-mono text-[11px] font-semibold',
                                    FIELD_TYPE_KIND_CLASS[fieldTypeKind(f.type)]
                                )}
                            >
                                <span className="block truncate">{f.type}</span>
                            </span>
                            {f.nullable ? null : (
                                <span
                                    className="shrink-0"
                                    title={t(
                                        'qubdi.workspace.viewerNode.notNull'
                                    )}
                                >
                                    <span
                                        aria-hidden="true"
                                        className="block size-1 rounded-full bg-muted-foreground"
                                    />
                                    <span className="sr-only">
                                        {t(
                                            'qubdi.workspace.viewerNode.notNull'
                                        )}
                                    </span>
                                </span>
                            )}
                        </span>
                    </li>
                ))}
                {table.fields.length === 0 ? (
                    <li className="h-8 border-t px-3 text-xs leading-8 text-muted-foreground">
                        {t('qubdi.workspace.viewerNode.noFields')}
                    </li>
                ) : null}
            </ul>
        </div>
    );
};
