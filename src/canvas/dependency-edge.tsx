import React, { memo } from 'react';
import { BaseEdge, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { DEPENDENCY_LINE } from './dependency-style';
import type { DependencyEdge } from './flow-model';

/** One dependency: a dashed line from a view's dot to the table it reads. */
export const DependencyLine = memo(function DependencyLine(
    props: EdgeProps<DependencyEdge>
) {
    const [path] = getSmoothStepPath({
        sourceX: props.sourceX,
        sourceY: props.sourceY,
        sourcePosition: props.sourcePosition,
        targetX: props.targetX,
        targetY: props.targetY,
        targetPosition: props.targetPosition,
        borderRadius: 12,
        offset: props.data?.reach ?? 22,
    });
    return (
        <BaseEdge
            id={props.id}
            data-dependency
            path={path}
            interactionWidth={18}
            style={{
                stroke: props.selected
                    ? DEPENDENCY_LINE.picked
                    : DEPENDENCY_LINE.stroke,
                strokeWidth: props.selected
                    ? DEPENDENCY_LINE.pickedWidth
                    : DEPENDENCY_LINE.width,
                strokeDasharray: DEPENDENCY_LINE.dash,
            }}
        />
    );
});
