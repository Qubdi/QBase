import type { Clip } from '@/core/commands/plan-entity';

// What Mod+C remembers lives for the browser tab (EDT-236): it is shared by
// every diagram opened in the tab and lost on reload. `pastes` counts how many
// times it was pasted, so each paste lands one slot further right (EDT-232).
let memory: { clip: Clip; pastes: number } | undefined;

export function remember(clip: Clip): void {
    memory = { clip, pastes: 0 };
}

export function recall(): { clip: Clip; pastes: number } | undefined {
    return memory;
}

export function countPaste(): void {
    if (memory) memory.pastes += 1;
}

export function forget(): void {
    memory = undefined;
}
