import type { Cardinality } from '@/core/model/link';

export type LineTone = 'plain' | 'picked';

export const TONE_STROKE: Record<LineTone, string> = {
    plain: 'hsl(var(--muted-foreground))',
    picked: 'hsl(var(--primary))',
};

export const markerId = (cardinality: Cardinality, tone: LineTone) =>
    `qb-end-${cardinality}-${tone}`;
