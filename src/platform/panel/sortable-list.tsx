import React from 'react';
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
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
    children: React.ReactNode;
}> = ({ ids, onMove, disabled, children }) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );
    const end = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id || disabled) return;
        onMove(String(active.id), String(over.id));
    };
    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={end}
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
    const sortable = useSortable({ id, disabled });
    return (
        <div
            ref={sortable.setNodeRef}
            style={{
                transform: CSS.Transform.toString(sortable.transform),
                transition: sortable.transition,
            }}
            className={cn(
                'flex items-center gap-1',
                sortable.isDragging && 'relative z-10 opacity-80',
                className
            )}
        >
            {leading}
            {disabled ? null : (
                <button
                    type="button"
                    aria-label={handleLabel}
                    ref={sortable.setActivatorNodeRef}
                    {...sortable.attributes}
                    {...sortable.listeners}
                    className={cn(
                        'flex h-8 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground',
                        handleClassName
                    )}
                >
                    <GripVertical className="size-3.5" />
                </button>
            )}
            {children}
        </div>
    );
};
