import type { Clip } from '@/core/commands/plan-entity';

/**
 * What Mod+C remembers. It lives in the page, not in the operating system's
 * clipboard (EDT-236), so it is shared by every diagram opened in this tab and
 * is gone on reload. `pastes` counts how often this copy was pasted, so each
 * paste lands one slot further right.
 */
let held: { clip: Clip; pastes: number } | undefined;

export function remember(clip: Clip): void {
    held = { clip, pastes: 0 };
}

export function recall(): { clip: Clip; pastes: number } | undefined {
    return held;
}

export function countPaste(): void {
    if (held) held.pastes += 1;
}
