import React from 'react';
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

/** A vertical list whose rows can be dragged by a handle; `onMove` gets the two ids. */
export const SortableList: React.FC<{
    ids: readonly string[];
    onMove: (activeId: string, overId: string) => void;
    disabled?: boolean;
    /** a row was picked up (the list is not disabled) */
    onStart?: (activeId: string) => void;
    /** the drag is over: dropped (after `onMove`) or cancelled */
    onFinish?: () => void;
    children: React.ReactNode;
}> = ({ ids, onMove, disabled, onStart, onFinish, children }) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );
    const start = ({ active }: DragStartEvent) => {
        if (!disabled) onStart?.(String(active.id));
    };
    const end = ({ active, over }: DragEndEvent) => {
        if (over && active.id !== over.id && !disabled) {
            onMove(String(active.id), String(over.id));
        }
        onFinish?.();
    };
    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={start}
            onDragEnd={end}
            onDragCancel={() => onFinish?.()}
        >
            <SortableContext
                items={[...ids]}
                strategy={verticalListSortingStrategy}
            >
                {children}
            </SortableContext>
        </DndContext>
    );
};

type Sortable = ReturnType<typeof useSortable>;

/**
 * The grip button that starts a drag. Give it what `useSortable` returned for
 * the item: `setActivatorNodeRef`, `attributes` and `listeners`.
 *
 * While a drag is on, the other items make room for the dragged one live, so
 * what `useSortable` moves (its `setNodeRef` element) must be the whole item.
 * A part of it that moves inside a box that clips (a card with a border and
 * `overflow-hidden`) is cut off and seems to vanish: that is why a table's card
 * is the moving element, and its grip sits inside it.
 */
export const SortableHandle: React.FC<{
    label: string;
    className?: string;
    activatorRef: Sortable['setActivatorNodeRef'];
    attributes: Sortable['attributes'];
    listeners: Sortable['listeners'];
}> = ({ label, className, activatorRef, attributes, listeners }) => (
    <button
        type="button"
        aria-label={label}
        ref={activatorRef}
        {...attributes}
        {...listeners}
        className={cn(
            'flex h-8 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground',
            className
        )}
    >
        <GripVertical className="size-3.5" />
    </button>
);

export const SortableRow: React.FC<{
    id: string;
    disabled?: boolean;
    handleLabel: string;
    className?: string;
    /** replaces the look of the handle (the compact card lays it over the row) */
    handleClassName?: string;
    /** drawn before the handle (an expand arrow) */
    leading?: React.ReactNode;
    children: React.ReactNode;
}> = ({
    id,
    disabled,
    handleLabel,
    className,
    handleClassName,
    leading,
    children,
}) => {
    const {
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
        attributes,
        listeners,
    } = useSortable({ id, disabled });
    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
            className={cn(
                'flex items-center gap-1',
                isDragging && 'relative z-10 opacity-80',
                className
            )}
        >
            {leading}
            {disabled ? null : (
                <SortableHandle
                    label={handleLabel}
                    className={handleClassName}
                    activatorRef={setActivatorNodeRef}
                    attributes={attributes}
                    listeners={listeners}
                />
            )}
            {children}
        </div>
    );
};
