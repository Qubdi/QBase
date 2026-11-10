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

/** How much of its colour a line keeps when a table at one end stands back; as for the table (opacity-40). */
const FADED_SHARE = 40;

/**
 * The paler, solid colour of a line that stands back. It is not made
 * see-through: the lines of several links leave a field by the same dot and
 * share its first stretch and its end marker, and see-through lines add up
 * where they overlap until the pile looks as bright as a line that does not
 * stand back. A solid colour looks the same however many lie on it.
 */
const fade = (colour: string) =>
    `color-mix(in srgb, ${colour} ${FADED_SHARE}%, hsl(var(--background)))`;

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
    const shade = (colour: string) =>
        props.data?.dimmed ? fade(colour) : colour;
    const endFill = shade(
        tone === 'plain' ? 'hsl(var(--muted-foreground))' : TONE_STROKE[tone]
    );

    return (
        <>
            <BaseEdge
                id={props.id}
                data-diff={mark}
                path={path}
                interactionWidth={18}
                style={{
                    stroke: shade(TONE_STROKE[tone]),
                    strokeWidth: mark ? 3 : LINE_WIDTH,
                    strokeDasharray: props.selected ? '5 5' : undefined,
                    transition: 'stroke 200ms',
                }}
            />
            {showEnds ? (
                <g data-dimmed={props.data?.dimmed || undefined}>
                    <EndMarker
                        x={props.sourceX}
                        y={props.sourceY}
                        dir={markerDirection(props.sourcePosition)}
                        cardinality={link.sourceCardinality}
                        fill={endFill}
                    />
                    <EndMarker
                        x={props.targetX}
                        y={props.targetY}
                        dir={markerDirection(props.targetPosition)}
                        cardinality={link.targetCardinality}
                        fill={endFill}
                    />
                </g>
            ) : null}
            {props.selected ? (
                <EdgeLabelRenderer>
                    {/*
                      The wrapper is moved to the line, the button only grows on
                      hover. They must not be one element: Tailwind 4 applies
                      `scale` outside an inline `transform`, so a hover scale on
                      the element that carries `translate(labelX, labelY)` pushes
                      it a tenth of that distance away from the origin, out from
                      under the pointer, and the dot cannot be clicked.
                    */}
                    <div
                        className="nodrag nopan pointer-events-none absolute"
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                    >
                        <button
                            type="button"
                            aria-label={t('canvas.link.select')}
                            title={t('canvas.link.select')}
                            data-testid={`link-dot-${props.id}`}
                            className="nodrag nopan pointer-events-auto flex size-6 items-center justify-center rounded-full border-2 border-teal-600 bg-background text-teal-600 shadow-lg transition-all hover:scale-110 hover:bg-teal-50"
                            onClick={(event) =>
                                surface.openLinkPopover(props.id, {
                                    x: event.clientX,
                                    y: event.clientY,
                                })
                            }
                        >
                            <Ellipsis
                                className="size-4 text-teal-600"
                                aria-hidden
                            />
                        </button>
                    </div>
                </EdgeLabelRenderer>
            ) : null}
        </>
    );
});
