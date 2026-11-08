import React, { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { Ellipsis } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EndMarker } from './cardinality-markers';
import {
    LINE_RADIUS,
    LINE_STUB,
    LINE_WIDTH,
    markerDirection,
    TONE_STROKE,
} from './line-style';
import type { LinkEdge } from './flow-model';
import { useShown } from './diff-marks';
import { useSurface } from './surface-context';

/** How much of a line is left when a table at one end stands back; as for the table (opacity-40). */
const DIMMED_OPACITY = 0.4;

/** One relationship: a smooth line between two field rows with crow's-foot ends. */
export const LinkLine = memo(function LinkLine(props: EdgeProps<LinkEdge>) {
    const { t } = useTranslation();
    const surface = useSurface();
    const link = useShown((d) => d.links.byId[props.id]);
    if (!link) return null;

    const reach = props.data?.reach ?? LINE_STUB;
    const [path, labelX, labelY] = getSmoothStepPath({
        sourceX: props.sourceX,
        sourceY: props.sourceY,
        sourcePosition: props.sourcePosition,
        targetX: props.targetX,
        targetY: props.targetY,
        targetPosition: props.targetPosition,
        borderRadius: LINE_RADIUS,
        offset: Math.max(reach, LINE_STUB),
    });
    const mark = props.data?.mark;
    const tone =
        mark === 'added' || mark === 'removed'
            ? mark
            : props.selected
              ? 'picked'
              : 'plain';
    const showEnds = surface.prefs.showCardinality;
    const faded = props.data?.dimmed ? DIMMED_OPACITY : 1;

    return (
        <>
            <BaseEdge
                id={props.id}
                data-diff={mark}
                path={path}
                interactionWidth={18}
                style={{
                    stroke: TONE_STROKE[tone],
                    strokeWidth: mark ? 3 : LINE_WIDTH,
                    strokeDasharray: props.selected ? '5 5' : undefined,
                    opacity: faded,
                    transition: 'opacity 200ms',
                }}
            />
            {showEnds ? (
                <g
                    style={{ opacity: faded, transition: 'opacity 200ms' }}
                    data-dimmed={props.data?.dimmed || undefined}
                >
                    <EndMarker
                        x={props.sourceX}
                        y={props.sourceY}
                        dir={markerDirection(props.sourcePosition)}
                        cardinality={link.sourceCardinality}
                        fill={
                            tone === 'plain'
                                ? 'hsl(var(--muted-foreground))'
                                : TONE_STROKE[tone]
                        }
                    />
                    <EndMarker
                        x={props.targetX}
                        y={props.targetY}
                        dir={markerDirection(props.targetPosition)}
                        cardinality={link.targetCardinality}
                        fill={
                            tone === 'plain'
                                ? 'hsl(var(--muted-foreground))'
                                : TONE_STROKE[tone]
                        }
                    />
                </g>
            ) : null}
            {props.selected ? (
                <EdgeLabelRenderer>
                    <button
                        type="button"
                        aria-label={t('canvas.link.select')}
                        data-testid={`link-dot-${props.id}`}
                        className="nodrag nopan pointer-events-auto absolute flex h-4 w-4 items-center justify-center rounded-full border border-teal-600 bg-white text-teal-600"
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                        onClick={(event) =>
                            surface.openLinkPopover(props.id, {
                                x: event.clientX,
                                y: event.clientY,
                            })
                        }
                    >
                        <Ellipsis className="h-3 w-3" aria-hidden />
                    </button>
                </EdgeLabelRenderer>
            ) : null}
        </>
    );
});
