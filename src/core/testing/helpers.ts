import { collectionOf } from '../model/collection';
import type { Design } from '../model/design';
import { createDesign } from '../model/defaults';
import { seededRandom } from '../model/ids';
import type { DatabaseType } from '../model/database';
import { createEntityParts } from '../model/defaults';
import { apply } from '../commands/apply';
import type { ApplyOptions, Command } from '../commands/command';

export const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

/** A fresh seeded random source: the same seed always gives the same ids. */
export function rng(seed = 7) {
    return seededRandom(seed);
}

export function blank(databaseType: DatabaseType = 'postgresql'): Design {
    return createDesign({
        name: 'Test',
        databaseType,
        now: NOW,
        id: 'design-1',
        random: rng(),
    });
}

/** Applies a command and fails the test if it is refused. */
export function applyOk(
    design: Design,
    command: Command,
    options: ApplyOptions = {}
): { design: Design; inverse: Command; changed: boolean } {
    const result = apply(design, command, { now: NOW, ...options });
    if (!result.ok) throw new Error(`refused: ${result.message}`);
    return result;
}

/** A design with `names` tables, each with the default `id` column. */
export function withTables(
    names: string[],
    databaseType: DatabaseType = 'postgresql'
): Design {
    let design = blank(databaseType);
    const random = rng(99);
    for (const name of names) {
        const parts = createEntityParts(design, { name, now: NOW, random });
        design = applyOk(design, { type: 'entity.insert', parts }).design;
    }
    return design;
}

/** Same design, ignoring `updatedAt` (it moves on every edit). */
export function sameButDate(a: Design, b: Design): Design {
    return { ...a, updatedAt: b.updatedAt };
}

export { collectionOf };
