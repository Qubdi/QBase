import React from 'react';
import type { Cardinality } from '@/core/model/link';
import { markerId, TONE_STROKE } from './line-style';
import type { LineTone } from './line-style';

/** Crow's-foot ends: a bar for "one", three prongs for "many" (EDT-173). */
function End({
    cardinality,
    tone,
}: {
    cardinality: Cardinality;
    tone: LineTone;
}) {
    return (
        <marker
            id={markerId(cardinality, tone)}
            markerWidth="14"
            markerHeight="14"
            viewBox="0 0 14 14"
            refX="13"
            refY="7"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
        >
            <path
                d={
                    cardinality === 'one'
                        ? 'M8 2 V12'
                        : 'M1 7 L13 1 M1 7 L13 13 M1 7 H13'
                }
                fill="none"
                stroke={TONE_STROKE[tone]}
                strokeWidth="1.6"
            />
        </marker>
    );
}

/** The marker definitions every line refers to; rendered once per canvas. */
export function MarkerDefs() {
    return (
        <svg
            aria-hidden
            width="0"
            height="0"
            style={{ position: 'absolute' }}
            data-testid="marker-defs"
        >
            <defs>
                {(['one', 'many'] as const).flatMap((cardinality) =>
                    (['plain', 'picked', 'added', 'removed'] as const).map(
                        (tone) => (
                            <End
                                key={`${cardinality}-${tone}`}
                                cardinality={cardinality}
                                tone={tone}
                            />
                        )
                    )
                )}
            </defs>
        </svg>
    );
}
