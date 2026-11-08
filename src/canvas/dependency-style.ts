/**
 * How a dependency line looks (EDT-184). One place, so the measured look of
 * the old editor can be put in here without touching the drawing code.
 */
export const DEPENDENCY_LINE = {
    stroke: 'hsl(var(--muted-foreground))',
    picked: 'hsl(var(--primary))',
    width: 1.6,
    pickedWidth: 2.2,
    /** SVG dash pattern: a dashed line tells it from a relationship */
    dash: '6 4',
} as const;
