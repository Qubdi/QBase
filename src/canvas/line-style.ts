import type { Cardinality } from '@/core/model/link';
import { Position } from '@xyflow/react';

export type LineTone = 'plain' | 'picked' | 'added' | 'removed';

/** slate-400 at rest, teal-600 when selected (both themes), as the old editor drew them. */
export const TONE_STROKE: Record<LineTone, string> = {
    plain: 'oklch(0.704 0.04 256.788)',
    picked: 'oklch(0.6 0.118 184.704)',
    added: '#16a34a',
    removed: '#dc2626',
};

/** Measured: a 2 px line, a 35 px stub off the card, quarter circles of 14 px. */
export const LINE_WIDTH = 2;
export const LINE_STUB = 35;
export const LINE_RADIUS = 14;

/** Which way an end marker sits from the line end: right-hand side cards push it right. */
export const markerDirection = (position: Position): 1 | -1 =>
    position === Position.Left ? -1 : 1;

export const cardinalityLabel = (c: Cardinality) => (c === 'one' ? '1' : 'N');
