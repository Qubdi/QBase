import React from 'react';
import type { Cardinality } from '@/core/model/link';
import { cardinalityLabel } from './line-style';

/**
 * A filled circle with "1" or "N" at the end of a line (EDT-173), drawn as
 * the old editor does: radius 5, a thin halo in the page colour, the letter in
 * 6 px type. `dir` is the side of the card the line leaves from (1 right,
 * -1 left); the circle sits just outside the card on the line.
 */
export function EndMarker({
    x,
    y,
    dir,
    cardinality,
    fill,
}: {
    x: number;
    y: number;
    dir: 1 | -1;
    cardinality: Cardinality;
    fill: string;
}) {
    // the marker box scales with the 2 px line, so the 5 unit circle is 10 px
    const cx = x + dir * 12;
    return (
        <g data-marker={cardinality} pointerEvents="none">
            <circle
                cx={cx}
                cy={y}
                r={10}
                fill={fill}
                stroke="hsl(var(--background))"
                strokeWidth={1}
            />
            <text
                x={cx}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fontWeight={600}
                fill="#fff"
                style={{ userSelect: 'none' }}
            >
                {cardinalityLabel(cardinality)}
            </text>
        </g>
    );
}
