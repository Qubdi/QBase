import type { Design } from '../model/design';
import { newDesignId, newId } from '../model/ids';
import type { RandomInt } from '../model/ids';
import { parse } from './parse';
import { relabel } from './relabel';
import { validateDiagramFile } from './validate-file';
import type { WireWarning } from './warning';

/** The file was refused; nothing was imported. */
export class ImportError extends Error {
    constructor(
        message: string,
        readonly problems: string[] = []
    ) {
        super(message);
        this.name = 'ImportError';
    }
}

export interface ImportOptions {
    now?: number;
    random?: RandomInt;
}

export interface ImportResult {
    design: Design;
    warnings: WireWarning[];
}

/**
 * Reads the text of a diagram file as a new diagram (DAT-066 to DAT-069):
 * invalid JSON or a file that breaks the strict shape is refused; unknown keys
 * are dropped; dates are "now"; every record gets a fresh id; a link or
 * dependency with a missing end is left out; primary-key index names are
 * cleared.
 */
export function importFileText(
    text: string,
    options: ImportOptions = {}
): ImportResult {
    const now = options.now ?? Date.now();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        throw new ImportError('The file is not valid JSON');
    }
    const problems = validateDiagramFile(json);
    if (problems.length > 0)
        throw new ImportError('The file is not a valid diagram', problems);

    const parsed = parse(json, {
        now,
        random: options.random,
        keepUnknown: false,
    });
    const fresh = relabel(parsed.design, (kind) =>
        kind === 'design' ? newDesignId(options.random) : newId(options.random)
    );
    const keys = { ...fresh.keys };
    for (const [id, key] of Object.entries(keys)) {
        if (key.pk) keys[id] = { ...key, label: '' };
    }
    return {
        design: { ...fresh, keys, createdAt: now, updatedAt: now },
        warnings: parsed.warnings,
    };
}
