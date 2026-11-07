import type { Cardinality } from '@/core/model/link';

export type LineTone = 'plain' | 'picked' | 'added' | 'removed';

export const TONE_STROKE: Record<LineTone, string> = {
    plain: 'hsl(var(--muted-foreground))',
    picked: 'hsl(var(--primary))',
    added: '#16a34a',
    removed: '#dc2626',
};

export const markerId = (cardinality: Cardinality, tone: LineTone) =>
    `qb-end-${cardinality}-${tone}`;
