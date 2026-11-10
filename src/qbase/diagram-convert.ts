import { z } from 'zod';
import type { Design } from '@/core/model/design';
import { DATABASE_TYPES } from '@/core/model/database';
import { parse } from '@/core/wire/parse';
import type { ParseOptions } from '@/core/wire/parse';
import { isRecord } from '@/core/wire/record-reader';
import type { RawRecord } from '@/core/wire/record-reader';
import { serialise } from '@/core/wire/serialise';
import type { WireWarning } from '@/core/wire/warning';
import type { Diagram } from './diagram-types';

/** The six collections of a diagram, as saved. */
const SECTIONS = [
    'tables',
    'relationships',
    'dependencies',
    'areas',
    'customTypes',
    'notes',
] as const;

type Section = (typeof SECTIONS)[number];

/** Dates travel as ISO text or milliseconds on the wire and as `Date` here. */
function toDate(value: unknown): Date {
    const date = new Date(
        value instanceof Date ||
            typeof value === 'string' ||
            typeof value === 'number'
            ? value
            : NaN
    );
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

/** The wire-shaped diagram of a design: what QBase code reads and sends to the server. */
export function designToDiagram(design: Design): Diagram {
    const wire = serialise(design);
    return {
        ...wire,
        createdAt: toDate(wire.createdAt),
        updatedAt: toDate(wire.updatedAt),
    } as unknown as Diagram;
}

export interface DiagramRead {
    design: Design;
    warnings: WireWarning[];
}

/**
 * Reads a wire-shaped diagram (or server content) into the model. Tolerant:
 * see `parse`. `Date` values are accepted for the two top-level dates.
 */
export function diagramToDesign(
    diagram: unknown,
    options?: ParseOptions
): DiagramRead {
    return parse(diagram, options);
}

/** The model slices each saved section is made from. */
const SOURCES: Record<Section, (d: Design) => unknown[]> = {
    tables: (d) => [d.entities, d.columns, d.keys, d.rules],
    relationships: (d) => [d.links],
    dependencies: (d) => [d.dependencies],
    areas: (d) => [d.regions],
    customTypes: (d) => [d.userTypes],
    notes: (d) => [d.memos],
};

/**
 * Turns designs into wire-shaped diagrams, keeping the array of every section
 * that did not change as the very same reference. Autosave counts changes by
 * reference (spec C1), so an edit must replace only the arrays it touched.
 * One projector per editor.
 */
export function createDiagramProjector(): (design: Design) => Diagram {
    let lastDesign: Design | undefined;
    let last: Diagram | undefined;
    return (design) => {
        if (design === lastDesign && last) return last;
        // sections whose model slices are untouched are not serialised at all:
        // the previous array is reused (CLI-045)
        const reused = new Set<Section>();
        if (lastDesign && last) {
            for (const section of SECTIONS) {
                const before = SOURCES[section](lastDesign);
                const now = SOURCES[section](design);
                if (before.every((slice, i) => Object.is(slice, now[i])))
                    reused.add(section);
            }
        }
        const next = designToDiagram(withoutSections(design, reused));
        // the filter is rebuilt on every projection: keep the old object while
        // it is unchanged, so autosave does not see a change that is not there
        if (last && lastDesign && Object.is(lastDesign.filter, design.filter))
            next.filter = last.filter;
        for (const section of reused)
            (next as unknown as RawRecord)[section] = last![section];
        lastDesign = design;
        last = next;
        return next;
    };
}

const NONE = { order: [], byId: {} };

/**
 * The design with the parts of reused sections emptied, so serialising it
 * costs only what changed. A note reads tables, areas and columns for its
 * position, so those stay whenever the notes are rebuilt.
 */
function withoutSections(design: Design, reused: ReadonlySet<Section>): Design {
    if (reused.size === 0) return design;
    const notesRebuilt = !reused.has('notes');
    const slim: Design = { ...design };
    if (reused.has('tables') && !notesRebuilt) {
        slim.entities = NONE;
        slim.columns = {};
        slim.keys = {};
        slim.rules = {};
    }
    if (reused.has('relationships')) slim.links = NONE;
    if (reused.has('dependencies')) slim.dependencies = [];
    if (reused.has('areas') && !notesRebuilt) slim.regions = NONE;
    if (reused.has('customTypes')) slim.userTypes = NONE;
    if (reused.has('notes')) slim.memos = NONE;
    return slim;
}

const text = (value: unknown) => typeof value === 'string';

/** What must hold before a diagram is taken in; the rest is repaired by `parse`. */
function shapeProblems(input: unknown): string[] {
    if (!isRecord(input)) return ['not an object'];
    const problems: string[] = [];
    if (!text(input.id)) problems.push('id: expected text');
    if (!text(input.name)) problems.push('name: expected text');
    if (
        !text(input.databaseType) ||
        !(DATABASE_TYPES as readonly string[]).includes(input.databaseType)
    )
        problems.push('databaseType: unknown database');
    for (const section of SECTIONS) {
        const value = input[section];
        if (value === undefined || value === null) continue;
        if (!Array.isArray(value)) {
            problems.push(`${section}: expected a list`);
            continue;
        }
        value.forEach((item, i) => {
            if (!isRecord(item) || !text(item.id))
                problems.push(
                    `${section}[${i}]: expected an object with an id`
                );
        });
    }
    const tables = Array.isArray(input.tables) ? input.tables : [];
    tables.forEach((table, i) => {
        if (isRecord(table) && !text(table.name))
            problems.push(`tables[${i}].name: expected text`);
    });
    return problems;
}

/**
 * Validates a diagram revived from server JSON and returns it in its settled
 * form (old shapes upgraded, missing collections empty, many-to-many made
 * one-to-many). A failure means "the server copy cannot be read".
 */
export const diagramSchema = z.unknown().transform((input, ctx): Diagram => {
    const problems = shapeProblems(input);
    if (problems.length > 0) {
        for (const message of problems)
            ctx.issues.push({ code: 'custom', message, input });
        return z.NEVER;
    }
    return designToDiagram(diagramToDesign(input).design);
});
