import type { Design } from '@/core/model/design';

/**
 * Colours for the overview map. Tables, areas and notes show in their own
 * colour (fill a little see-through, stroke solid), so they stand out from
 * the card-coloured map background and the dimmed outside in both themes.
 */
export function miniFill(design: Design, id: string, type?: string): string {
    const tint =
        type === 'region'
            ? design.regions.byId[id]?.tint
            : type === 'memo'
              ? design.memos.byId[id]?.tint
              : design.entities.byId[id]?.color;
    const base = tint ?? 'hsl(var(--muted-foreground))';
    return `color-mix(in srgb, ${base} ${type === 'region' ? 35 : 80}%, transparent)`;
}

export function miniStroke(design: Design, id: string, type?: string): string {
    const tint =
        type === 'region'
            ? design.regions.byId[id]?.tint
            : type === 'memo'
              ? design.memos.byId[id]?.tint
              : design.entities.byId[id]?.color;
    return tint ?? 'hsl(var(--muted-foreground))';
}

/** The part of the map outside the visible window, and the window's outline. */
export const MINIMAP_MASK = 'hsl(var(--muted-foreground) / 0.18)';
export const MINIMAP_WINDOW = 'hsl(var(--primary))';
export const MINIMAP_BACKGROUND = 'hsl(var(--card))';
