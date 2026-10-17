import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    planFieldHandles,
    scheduleOncePerFrame,
} from './table-node-field-handles';
import {
    Handle,
    Position,
    useConnection,
    useUpdateNodeInternals,
} from '@xyflow/react';
import { Button } from '@/components/button/button';
import {
    KeyRound,
    Link2,
    MessageCircleMore,
    SquareDot,
    SquareMinus,
    SquarePlus,
    Pencil,
} from 'lucide-react';
import { generateDBFieldSuffix, type DBField } from '@/lib/domain/db-field';
import { useDiagram } from '@/hooks/use-diagram';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useDiff } from '@/context/diff-context/use-diff';
import { useLocalConfig } from '@/hooks/use-local-config';
import {
    BOTTOM_SOURCE_HANDLE_ID_PREFIX,
    TOP_SOURCE_HANDLE_ID_PREFIX,
} from './table-node-dependency-indicator';
import { useCanvas } from '@/hooks/use-canvas';
import { useLayout } from '@/hooks/use-layout';
import { FIELD_TYPE_KIND_CLASS, fieldTypeKind } from './field-type-kind';
import { FieldHoverCard } from './table-node-field-hover-card';

export const LEFT_HANDLE_ID_PREFIX = 'left_rel_';
export const RIGHT_HANDLE_ID_PREFIX = 'right_rel_';
export const TARGET_ID_PREFIX = 'target_rel_';

// The dot that starts a relationship, on both edges of the hovered row. A
// hollow ring that fills and grows under the pointer; the invisible ring around
// it makes it easy to grab.
const CONNECT_HANDLE_CLASS =
    '!size-3 !rounded-full !border-2 !border-primary !bg-card !shadow-sm !transition-all !duration-150 !cursor-crosshair hover:!scale-150 hover:!bg-primary hover:!shadow-[0_0_0_4px_hsl(var(--primary)/0.2)] after:absolute after:-inset-2 after:content-[""]';

export interface TableNodeFieldProps {
    tableNodeId: string;
    field: DBField;
    focused: boolean;
    highlighted: boolean;
    visible: boolean;
    isConnectable: boolean;
    // Target edge count passed from canvas to ensure sync with edge creation
    targetEdgeCount?: number;
}

const arePropsEqual = (
    prevProps: TableNodeFieldProps,
    nextProps: TableNodeFieldProps
) => {
    return (
        prevProps.field.id === nextProps.field.id &&
        prevProps.field.name === nextProps.field.name &&
        prevProps.field.primaryKey === nextProps.field.primaryKey &&
        prevProps.field.nullable === nextProps.field.nullable &&
        prevProps.field.comments === nextProps.field.comments &&
        prevProps.field.unique === nextProps.field.unique &&
        prevProps.field.type.id === nextProps.field.type.id &&
        prevProps.field.type.name === nextProps.field.type.name &&
        prevProps.field.characterMaximumLength ===
            nextProps.field.characterMaximumLength &&
        prevProps.field.precision === nextProps.field.precision &&
        prevProps.field.scale === nextProps.field.scale &&
        prevProps.field.isArray === nextProps.field.isArray &&
        prevProps.focused === nextProps.focused &&
        prevProps.highlighted === nextProps.highlighted &&
        prevProps.visible === nextProps.visible &&
        prevProps.isConnectable === nextProps.isConnectable &&
        prevProps.tableNodeId === nextProps.tableNodeId &&
        prevProps.targetEdgeCount === nextProps.targetEdgeCount
    );
};

export const TableNodeField: React.FC<TableNodeFieldProps> = React.memo(
    ({
        field,
        focused,
        tableNodeId,
        highlighted,
        visible,
        isConnectable,
        targetEdgeCount,
    }) => {
        const {
            relationships,
            readonly,
            highlightedCustomType,
            databaseType,
            getTable,
            getField,
        } = useDiagram();

        const updateNodeInternals = useUpdateNodeInternals();
        const connection = useConnection();
        const isTarget = useMemo(
            () =>
                connection.inProgress &&
                connection.fromNode.id !== tableNodeId &&
                (connection.fromHandle.id?.startsWith(RIGHT_HANDLE_ID_PREFIX) ||
                    connection.fromHandle.id?.startsWith(
                        LEFT_HANDLE_ID_PREFIX
                    )),
            [
                connection.inProgress,
                connection.fromNode?.id,
                connection.fromHandle?.id,
                tableNodeId,
            ]
        );
        const isTargetFromView = useMemo(
            () =>
                connection.inProgress &&
                connection.fromNode.id !== tableNodeId &&
                (connection.fromHandle.id?.startsWith(
                    TOP_SOURCE_HANDLE_ID_PREFIX
                ) ||
                    connection.fromHandle.id?.startsWith(
                        BOTTOM_SOURCE_HANDLE_ID_PREFIX
                    )),
            [
                connection.inProgress,
                connection.fromNode?.id,
                connection.fromHandle?.id,
                tableNodeId,
            ]
        );

        const numberOfEdgesToField = useMemo(() => {
            // Use targetEdgeCount from canvas when available (ensures sync with edge creation)
            if (targetEdgeCount !== undefined) {
                return targetEdgeCount;
            }
            // Fallback: count from relationships
            let count = 0;
            for (const rel of relationships) {
                if (
                    rel.targetTableId === tableNodeId &&
                    rel.targetFieldId === field.id
                ) {
                    count++;
                }
            }
            return count;
        }, [targetEdgeCount, relationships, tableNodeId, field.id]);

        // a relationship line starts at this field: it needs source handles
        const isRelationshipSource = useMemo(
            () => relationships.some((rel) => rel.sourceFieldId === field.id),
            [relationships, field.id]
        );

        const handlePlan = useMemo(
            () =>
                planFieldHandles({
                    isConnectable,
                    focused,
                    isRelationshipSource,
                    connectionInProgress: connection.inProgress,
                    isTarget: !!(isTarget || false),
                    numberOfEdgesToField,
                }),
            [
                isConnectable,
                focused,
                isRelationshipSource,
                connection.inProgress,
                isTarget,
                numberOfEdgesToField,
            ]
        );

        const isForeignKey = useMemo(() => {
            return relationships.some((rel) => {
                // FK placement logic:
                // - FK goes on the "many" side when cardinalities differ
                // - FK goes on target when cardinalities are the same (one:one, many:many)
                // The only case where FK goes on source is many:one
                const fkOnSource =
                    rel.sourceCardinality === 'many' &&
                    rel.targetCardinality === 'one';

                if (fkOnSource) {
                    return (
                        rel.sourceTableId === tableNodeId &&
                        rel.sourceFieldId === field.id
                    );
                }

                // All other cases: FK on target
                return (
                    rel.targetTableId === tableNodeId &&
                    rel.targetFieldId === field.id
                );
            });
        }, [relationships, tableNodeId, field.id]);

        // React Flow learns where handles are only when told to measure, so do it
        // whenever the handles this field needs change (first render, a line is
        // added or removed, the table is focused). One measure per table per frame.
        const previousLayoutKeyRef = useRef<string | null>(null);

        useEffect(() => {
            if (previousLayoutKeyRef.current === handlePlan.layoutKey) return;
            previousLayoutKeyRef.current = handlePlan.layoutKey;
            scheduleOncePerFrame(tableNodeId, updateNodeInternals);
        }, [tableNodeId, updateNodeInternals, handlePlan.layoutKey]);

        const {
            checkIfFieldRemoved,
            checkIfNewField,
            getFieldNewName,
            getFieldNewType,
            getFieldNewNullable,
            getFieldNewPrimaryKey,
            getFieldNewCharacterMaximumLength,
            getFieldNewPrecision,
            getFieldNewScale,
            getFieldNewIsArray,
            checkIfFieldHasChange,
            isSummaryOnly,
        } = useDiff();

        const [diffState, setDiffState] = useState<{
            isDiffFieldRemoved: boolean;
            isDiffNewField: boolean;
            fieldDiffChangedName: ReturnType<typeof getFieldNewName>;
            fieldDiffChangedType: ReturnType<typeof getFieldNewType>;
            fieldDiffChangedNullable: ReturnType<typeof getFieldNewNullable>;
            fieldDiffChangedCharacterMaximumLength: ReturnType<
                typeof getFieldNewCharacterMaximumLength
            >;
            fieldDiffChangedScale: ReturnType<typeof getFieldNewScale>;
            fieldDiffChangedPrecision: ReturnType<typeof getFieldNewPrecision>;
            fieldDiffChangedPrimaryKey: ReturnType<
                typeof getFieldNewPrimaryKey
            >;
            fieldDiffChangedIsArray: ReturnType<typeof getFieldNewIsArray>;
            isDiffFieldChanged: boolean;
        }>({
            isDiffFieldRemoved: false,
            isDiffNewField: false,
            fieldDiffChangedName: null,
            fieldDiffChangedType: null,
            fieldDiffChangedNullable: null,
            fieldDiffChangedCharacterMaximumLength: null,
            fieldDiffChangedScale: null,
            fieldDiffChangedPrecision: null,
            fieldDiffChangedPrimaryKey: null,
            fieldDiffChangedIsArray: null,
            isDiffFieldChanged: false,
        });

        useEffect(() => {
            // Calculate diff state asynchronously
            const timer = requestAnimationFrame(() => {
                setDiffState({
                    isDiffFieldRemoved: checkIfFieldRemoved({
                        fieldId: field.id,
                    }),
                    isDiffNewField: checkIfNewField({ fieldId: field.id }),
                    fieldDiffChangedName: getFieldNewName({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedType: getFieldNewType({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedNullable: getFieldNewNullable({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedPrimaryKey: getFieldNewPrimaryKey({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedCharacterMaximumLength:
                        getFieldNewCharacterMaximumLength({
                            fieldId: field.id,
                        }),
                    fieldDiffChangedScale: getFieldNewScale({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedPrecision: getFieldNewPrecision({
                        fieldId: field.id,
                    }),
                    fieldDiffChangedIsArray: getFieldNewIsArray({
                        fieldId: field.id,
                    }),
                    isDiffFieldChanged: checkIfFieldHasChange({
                        fieldId: field.id,
                        tableId: tableNodeId,
                    }),
                });
            });
            return () => cancelAnimationFrame(timer);
        }, [
            checkIfFieldRemoved,
            checkIfNewField,
            getFieldNewName,
            getFieldNewType,
            getFieldNewPrimaryKey,
            getFieldNewNullable,
            checkIfFieldHasChange,
            getFieldNewCharacterMaximumLength,
            getFieldNewPrecision,
            getFieldNewScale,
            getFieldNewIsArray,
            field.id,
            tableNodeId,
        ]);

        const {
            isDiffFieldRemoved,
            isDiffNewField,
            fieldDiffChangedName,
            fieldDiffChangedType,
            isDiffFieldChanged,
            fieldDiffChangedNullable,
            fieldDiffChangedPrimaryKey,
            fieldDiffChangedCharacterMaximumLength,
            fieldDiffChangedScale,
            fieldDiffChangedPrecision,
            fieldDiffChangedIsArray,
        } = diffState;

        const isFieldAttributeChanged = useMemo(() => {
            return (
                fieldDiffChangedCharacterMaximumLength ||
                fieldDiffChangedScale ||
                fieldDiffChangedPrecision ||
                fieldDiffChangedIsArray
            );
        }, [
            fieldDiffChangedCharacterMaximumLength,
            fieldDiffChangedScale,
            fieldDiffChangedPrecision,
            fieldDiffChangedIsArray,
        ]);

        const isCustomTypeHighlighted = useMemo(() => {
            if (!highlightedCustomType) return false;
            return field.type.name === highlightedCustomType.name;
        }, [highlightedCustomType, field.type.name]);
        const { showFieldAttributes, compactTables } = useLocalConfig();

        // details of the column appear once the mouse has rested on the row
        const rowRef = useRef<HTMLDivElement>(null);
        const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
        const [cardAnchor, setCardAnchor] = useState<DOMRect | null>(null);
        const hideCard = useCallback(() => {
            clearTimeout(hoverTimer.current);
            setCardAnchor(null);
        }, []);
        const scheduleCard = useCallback(() => {
            if (connection.inProgress) return;
            clearTimeout(hoverTimer.current);
            hoverTimer.current = setTimeout(() => {
                if (rowRef.current) {
                    setCardAnchor(rowRef.current.getBoundingClientRect());
                }
            }, 250);
        }, [connection.inProgress]);
        useEffect(() => () => clearTimeout(hoverTimer.current), []);
        useEffect(() => {
            if (connection.inProgress) hideCard();
        }, [connection.inProgress, hideCard]);

        const { closeAllTablesInSidebar } = useLayout();
        const { setEditTableModeTable } = useCanvas();
        const openEditTableOnField = useCallback(() => {
            if (readonly) {
                return;
            }

            closeAllTablesInSidebar();
            setEditTableModeTable({
                tableId: tableNodeId,
                fieldId: field.id,
            });
        }, [
            setEditTableModeTable,
            closeAllTablesInSidebar,
            tableNodeId,
            field.id,
            readonly,
        ]);

        const typeKindClass =
            FIELD_TYPE_KIND_CLASS[fieldTypeKind(field.type.name)];

        return (
            <div
                ref={rowRef}
                onMouseEnter={scheduleCard}
                onMouseLeave={hideCard}
                onMouseDown={hideCard}
                className={cn(
                    'group relative flex h-8 items-center justify-between gap-1 border-t px-3 text-sm last:rounded-b-[6px] hover:bg-slate-100 dark:hover:bg-slate-800',
                    'transition-all duration-200 ease-in-out',
                    {
                        'bg-teal-100 dark:bg-teal-900':
                            highlighted && !isCustomTypeHighlighted,
                        'bg-yellow-100 dark:bg-yellow-900':
                            isCustomTypeHighlighted,
                        'max-h-8 opacity-100': visible,
                        'z-0 max-h-0 overflow-hidden opacity-0': !visible,
                        // while a relationship is being dragged, the rows it
                        // can end on light up
                        'bg-primary/5 hover:bg-primary/20': !!isTarget,
                        'bg-sky-200 dark:bg-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900 border-sky-300 dark:border-sky-700':
                            isDiffFieldChanged &&
                            !isSummaryOnly &&
                            !isDiffFieldRemoved &&
                            !isDiffNewField,
                        'bg-red-200 dark:bg-red-800 hover:bg-red-100 dark:hover:bg-red-900 border-red-300 dark:border-red-700':
                            isDiffFieldRemoved,
                        'bg-green-200 dark:bg-green-800 hover:bg-green-100 dark:hover:bg-green-900 border-green-300 dark:border-green-700':
                            isDiffNewField,
                    }
                )}
            >
                {handlePlan.source ? (
                    <>
                        <Handle
                            id={`${RIGHT_HANDLE_ID_PREFIX}${field.id}`}
                            className={cn(
                                CONNECT_HANDLE_CLASS,
                                (!focused || readonly || isTargetFromView) &&
                                    '!pointer-events-none !opacity-0'
                            )}
                            position={Position.Right}
                            type="source"
                        />
                        <Handle
                            id={`${LEFT_HANDLE_ID_PREFIX}${field.id}`}
                            className={cn(
                                CONNECT_HANDLE_CLASS,
                                (!focused || readonly || isTargetFromView) &&
                                    '!pointer-events-none !opacity-0'
                            )}
                            position={Position.Left}
                            type="source"
                        />
                    </>
                ) : null}
                {Array.from({ length: handlePlan.targets }, (_, index) => (
                    <Handle
                        id={`${TARGET_ID_PREFIX}${index}_${field.id}`}
                        key={`${TARGET_ID_PREFIX}${index}_${field.id}`}
                        className={`!invisible`}
                        position={Position.Left}
                        type="target"
                    />
                ))}
                {handlePlan.dropZone ? (
                    <Handle
                        id={`${TARGET_ID_PREFIX}${numberOfEdgesToField}_${field.id}`}
                        className="!absolute !left-0 !top-0 !h-full !w-full !transform-none !rounded-none !border-none !opacity-0"
                        position={Position.Left}
                        type="target"
                    />
                ) : null}
                <span className="flex size-4 shrink-0 items-center justify-center">
                    {(field.primaryKey && !fieldDiffChangedPrimaryKey?.old) ||
                    fieldDiffChangedPrimaryKey?.new ? (
                        <KeyRound
                            size={14}
                            className={
                                isDiffFieldRemoved ||
                                isDiffNewField ||
                                (isDiffFieldChanged && !isSummaryOnly)
                                    ? 'text-current'
                                    : 'text-amber-500'
                            }
                        />
                    ) : isForeignKey &&
                      !isDiffFieldRemoved &&
                      !isDiffNewField &&
                      !isDiffFieldChanged ? (
                        <Link2
                            size={14}
                            className="text-blue-600 dark:text-blue-400"
                        />
                    ) : null}
                </span>
                <div
                    className={cn(
                        'flex items-center gap-1 min-w-0 text-left flex-1',
                        {
                            'font-semibold': field.primaryKey || field.unique,
                        }
                    )}
                >
                    {isDiffFieldRemoved ? (
                        <SquareMinus className="size-3.5 shrink-0 text-red-800 dark:text-red-200" />
                    ) : isDiffNewField ? (
                        <SquarePlus className="size-3.5 shrink-0 text-green-800 dark:text-green-200" />
                    ) : isDiffFieldChanged && !isSummaryOnly ? (
                        <SquareDot className="size-3.5 shrink-0 text-sky-800 dark:text-sky-200" />
                    ) : null}

                    <span
                        className={cn('truncate min-w-0', {
                            'text-red-800 font-normal dark:text-red-200':
                                isDiffFieldRemoved,
                            'text-green-800 font-normal dark:text-green-200':
                                isDiffNewField,
                            'text-sky-800 font-normal dark:text-sky-200':
                                isDiffFieldChanged &&
                                !isSummaryOnly &&
                                !isDiffFieldRemoved &&
                                !isDiffNewField,
                            'text-blue-600 dark:text-blue-400':
                                isForeignKey &&
                                !isDiffFieldRemoved &&
                                !isDiffNewField &&
                                !isDiffFieldChanged,
                        })}
                    >
                        {fieldDiffChangedName ? (
                            <>
                                {fieldDiffChangedName.old}{' '}
                                <span className="font-medium">→</span>{' '}
                                {fieldDiffChangedName.new}
                            </>
                        ) : (
                            field.name
                        )}
                    </span>
                    {field.comments ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="shrink-0 cursor-pointer text-muted-foreground">
                                    <MessageCircleMore size={14} />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">
                                {field.comments}
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                </div>

                <div
                    className={cn(
                        'ml-auto flex shrink-0 items-center gap-1 min-w-0',
                        !readonly ? 'group-hover:hidden' : ''
                    )}
                >
                    {field.unique && !field.primaryKey ? (
                        <span
                            className="shrink-0 rounded-sm border px-1 text-[9px] font-semibold leading-3 text-muted-foreground"
                            title="Unique"
                        >
                            UQ
                        </span>
                    ) : null}
                    <div
                        className={cn(
                            'min-w-0 overflow-hidden rounded-md px-1.5 py-0.5 text-right font-mono text-[11px] font-semibold',
                            typeKindClass,
                            compactTables ? 'hidden' : '',
                            isDiffFieldRemoved
                                ? 'text-red-800 dark:text-red-200'
                                : '',
                            isDiffNewField
                                ? 'text-green-800 dark:text-green-200'
                                : '',
                            isDiffFieldChanged &&
                                !isDiffFieldRemoved &&
                                !isSummaryOnly &&
                                !isDiffNewField
                                ? 'text-sky-800 dark:text-sky-200'
                                : '',
                            isDiffFieldRemoved ||
                                isDiffNewField ||
                                (isDiffFieldChanged && !isSummaryOnly)
                                ? 'bg-transparent'
                                : ''
                        )}
                    >
                        <span className="block truncate">
                            {isFieldAttributeChanged || fieldDiffChangedType ? (
                                <>
                                    <span className="line-through">
                                        {
                                            (
                                                fieldDiffChangedType?.old
                                                    ?.name ?? field.type.name
                                            ).split(' ')[0]
                                        }
                                        {showFieldAttributes
                                            ? generateDBFieldSuffix(
                                                  {
                                                      ...field,
                                                      ...{
                                                          precision:
                                                              fieldDiffChangedPrecision?.old ??
                                                              field.precision,
                                                          scale:
                                                              fieldDiffChangedScale?.old ??
                                                              field.scale,
                                                          characterMaximumLength:
                                                              fieldDiffChangedCharacterMaximumLength?.old ??
                                                              field.characterMaximumLength,
                                                          isArray:
                                                              fieldDiffChangedIsArray?.old ??
                                                              field.isArray,
                                                      },
                                                  },
                                                  {
                                                      databaseType,
                                                  }
                                              )
                                            : field.isArray
                                              ? '[]'
                                              : ''}
                                    </span>{' '}
                                    {
                                        (
                                            fieldDiffChangedType?.new?.name ??
                                            field.type.name
                                        ).split(' ')[0]
                                    }
                                    {showFieldAttributes
                                        ? generateDBFieldSuffix(
                                              {
                                                  ...field,
                                                  ...{
                                                      precision:
                                                          fieldDiffChangedPrecision?.new ??
                                                          field.precision,
                                                      scale:
                                                          fieldDiffChangedScale?.new ??
                                                          field.scale,
                                                      characterMaximumLength:
                                                          fieldDiffChangedCharacterMaximumLength?.new ??
                                                          field.characterMaximumLength,
                                                      isArray:
                                                          fieldDiffChangedIsArray?.new ??
                                                          field.isArray,
                                                  },
                                              },
                                              {
                                                  databaseType,
                                              }
                                          )
                                        : (fieldDiffChangedIsArray?.new ??
                                            field.isArray)
                                          ? '[]'
                                          : ''}
                                </>
                            ) : (
                                `${field.type.name.split(' ')[0]}${
                                    showFieldAttributes
                                        ? generateDBFieldSuffix(field, {
                                              databaseType,
                                          })
                                        : field.isArray
                                          ? '[]'
                                          : ''
                                }`
                            )}
                            {fieldDiffChangedNullable ? (
                                fieldDiffChangedNullable.new ? (
                                    <span className="font-semibold">?</span>
                                ) : (
                                    <span className="line-through">?</span>
                                )
                            ) : (
                                ''
                            )}
                        </span>
                    </div>
                    {compactTables || fieldDiffChangedNullable ? null : (
                        <span
                            className={cn(
                                'size-1.5 shrink-0 rounded-full',
                                field.nullable
                                    ? 'border-[1.5px] border-muted-foreground/60'
                                    : 'bg-muted-foreground/60'
                            )}
                            title={field.nullable ? 'Nullable' : 'Not null'}
                        />
                    )}
                </div>
                {readonly ? null : (
                    <div className="ml-2 hidden shrink-0 flex-row group-hover:flex">
                        <Button
                            variant="ghost"
                            className="size-6 p-0 hover:bg-primary-foreground"
                            onClick={(e) => {
                                e.stopPropagation();
                                openEditTableOnField();
                            }}
                        >
                            <Pencil className="!size-3.5 text-teal-600" />
                        </Button>
                    </div>
                )}
                {cardAnchor ? (
                    <FieldHoverCard
                        anchor={cardAnchor}
                        field={field}
                        tableId={tableNodeId}
                        relationships={relationships}
                        getTable={getTable}
                        getField={getField}
                        databaseType={databaseType}
                    />
                ) : null}
            </div>
        );
    },
    arePropsEqual
);

TableNodeField.displayName = 'TableNodeField';
