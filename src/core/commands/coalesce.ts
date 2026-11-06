import type { Command } from './command';

/**
 * Commands that may be merged with the one before them in the history (typing
 * in one field, dragging a resize handle). Two commands with the same key, one
 * after another, count as one undo step. Structural commands (add, remove,
 * reorder, replace, group) return undefined and always stand alone.
 */
export function coalesceKey(command: Command): string | undefined {
    switch (command.type) {
        case 'design.rename':
            return 'design.rename';
        case 'entity.update':
            return `entity.update:${command.id}:${Object.keys(command.patch).sort().join(',')}`;
        case 'part.update':
            return `part.update:${command.part}:${command.id}:${Object.keys(command.patch).sort().join(',')}`;
        case 'item.update':
            return `item.update:${command.collection}:${command.id}:${Object.keys(command.patch).sort().join(',')}`;
        case 'entity.move':
            return `entity.move:${command.moves
                .map((m) => m.id)
                .sort()
                .join(',')}`;
        default:
            return undefined;
    }
}
