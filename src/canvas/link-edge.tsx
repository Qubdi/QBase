import React, { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { markerId, TONE_STROKE } from './line-style';
import type { LinkEdge } from './flow-model';
import { useShown } from './diff-marks';
import { useSurface } from './surface-context';

/** One relationship: a smooth line between two field rows with crow's-foot ends. */
export const LinkLine = memo(function LinkLine(props: EdgeProps<LinkEdge>) {
    const { t } = useTranslation();
    const surface = useSurface();
    const link = useShown((d) => d.links.byId[props.id]);
    if (!link) return null;

    const reach = props.data?.reach ?? 22;
    const [path, labelX, labelY] = getSmoothStepPath({
        sourceX: props.sourceX,
        sourceY: props.sourceY,
        sourcePosition: props.sourcePosition,
        targetX: props.targetX,
        targetY: props.targetY,
        targetPosition: props.targetPosition,
        borderRadius: 12,
        offset: reach,
    });
    const mark = props.data?.mark;
    const tone =
        mark === 'added' || mark === 'removed'
            ? mark
            : props.selected
              ? 'picked'
              : 'plain';
    const showEnds = surface.prefs.showCardinality;

    return (
        <>
            <BaseEdge
                id={props.id}
                data-diff={mark}
                path={path}
                interactionWidth={18}
                markerStart={
                    showEnds
                        ? `url(#${markerId(link.sourceCardinality, tone)})`
                        : undefined
                }
                markerEnd={
                    showEnds
                        ? `url(#${markerId(link.targetCardinality, tone)})`
                        : undefined
                }
                style={{
                    stroke: TONE_STROKE[tone],
                    strokeWidth: mark ? 3 : props.selected ? 2 : 1.4,
                }}
            />
            {props.selected ? (
                <EdgeLabelRenderer>
                    <button
                        type="button"
                        aria-label={t('canvas.link.select')}
                        data-testid={`link-dot-${props.id}`}
                        className="nodrag nopan pointer-events-auto absolute h-3 w-3 rounded-full border-2 border-background bg-primary"
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                        onClick={(event) =>
                            surface.openLinkPopover(props.id, {
                                x: event.clientX,
                                y: event.clientY,
                            })
                        }
                    />
                </EdgeLabelRenderer>
            ) : null}
        </>
    );
});
