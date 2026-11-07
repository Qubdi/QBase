import React, { useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { Id } from '@/core/model/id';
import type { Point } from './flow-model';

interface Props {
    sourceId: Id;
    /** the hosting element, to turn page points into points inside it */
    container: HTMLElement | null;
}

/**
 * The line that follows the pointer while a table-to-table relationship is
 * being drawn (EDT-158). It starts at the middle of the source table and
 * snaps to the table under the pointer. The click that picks the target is
 * received by the node itself; this layer only draws.
 */
export function LinkDraftLayer({ sourceId, container }: Props) {
    const { t } = useTranslation();
    const flow = useReactFlow();
    const [pointer, setPointer] = useState<Point | undefined>();
    const [over, setOver] = useState<Id | undefined>();

    useEffect(() => {
        const move = (event: MouseEvent) => {
            setPointer({ x: event.clientX, y: event.clientY });
            const node = (event.target as HTMLElement | null)?.closest?.(
                '.react-flow__node-entity'
            );
            setOver(node?.getAttribute('data-id') ?? undefined);
        };
        window.addEventListener('mousemove', move);
        return () => window.removeEventListener('mousemove', move);
    }, []);

    const centreOf = (id: Id): Point | undefined => {
        const node = flow.getNode(id);
        const box = container?.getBoundingClientRect();
        if (!node || !box) return undefined;
        const width = node.measured?.width ?? node.width ?? 224;
        const height = node.measured?.height ?? node.height ?? 100;
        const page = flow.flowToScreenPosition({
            x: node.position.x + width / 2,
            y: node.position.y + height / 2,
        });
        return { x: page.x - box.left, y: page.y - box.top };
    };

    const from = centreOf(sourceId);
    const box = container?.getBoundingClientRect();
    const target =
        over && over !== sourceId
            ? centreOf(over)
            : pointer && box
              ? { x: pointer.x - box.left, y: pointer.y - box.top }
              : undefined;

    return (
        <div
            data-testid="link-draft"
            className="pointer-events-none absolute inset-0 z-40"
        >
            {from && target ? (
                <svg className="h-full w-full">
                    <line
                        x1={from.x}
                        y1={from.y}
                        x2={target.x}
                        y2={target.y}
                        stroke="hsl(var(--primary))"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                    />
                </svg>
            ) : null}
            <div
                role="status"
                className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
            >
                {t('canvas.drawing.hint')}
            </div>
        </div>
    );
}
