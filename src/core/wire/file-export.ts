import { listOf } from '../model/collection';
import type { Design } from '../model/design';
import { relabel } from './relabel';
import { serialiseText } from './serialise';

/** `QBase(<diagram name>).json` (DAT-061). */
export function exportFileName(design: Pick<Design, 'name'>): string {
    return `QBase(${design.name}).json`;
}

/**
 * The design as an export file (DAT-061 to DAT-065): every id except check
 * constraint ids becomes a small decimal counter, all references follow;
 * primary-key index names are emptied; a dependency or link that points at
 * nothing is left out; no filter or config is included; the version key is
 * written. 2-space indent.
 */
export function exportFileText(design: Design): string {
    let counter = 0;
    const numbered = relabel(design, (kind, old) =>
        kind === 'rule' ? old : String(counter++)
    );
    const keys = { ...numbered.keys };
    for (const [id, key] of Object.entries(keys)) {
        if (key.pk) keys[id] = { ...key, label: '' };
    }
    // links whose ends are gone cannot exist in the model, but a hand-built
    // design may hold one: drop it rather than write a dangling reference
    const links = listOf(numbered.links).filter(
        (link) =>
            numbered.columns[link.sourceColumnId] &&
            numbered.columns[link.targetColumnId] &&
            numbered.entities.byId[link.sourceEntityId] &&
            numbered.entities.byId[link.targetEntityId]
    );
    return serialiseText({
        ...numbered,
        keys,
        links: {
            byId: Object.fromEntries(links.map((l) => [l.id, l])),
            order: links.map((l) => l.id),
        },
    });
}
