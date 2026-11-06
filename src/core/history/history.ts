import { apply } from '../commands/apply';
import { coalesceKey } from '../commands/coalesce';
import type { ApplyOptions, Command, FailureReason } from '../commands/command';
import type { Design } from '../model/design';

/** One undo step: the command that reverses it, and when it was made. */
export interface HistoryStep {
    /** applying this undoes the step (or, on the redo stack, redoes it) */
    command: Command;
    /** coalescing key of the edit that made the step */
    key?: string;
    /** time of the last edit merged into the step, in ms */
    at: number;
}

/** Two stacks of steps, newest last. Immutable: every function returns a new one. */
export interface History {
    undo: readonly HistoryStep[];
    redo: readonly HistoryStep[];
}

export interface HistoryOptions {
    /** most steps kept on the undo stack; older ones fall off (default 200) */
    limit?: number;
    /** edits with the same key closer than this merge into one step (default 1000 ms) */
    mergeWithin?: number;
}

export const DEFAULT_LIMIT = 200;
export const DEFAULT_MERGE_WINDOW = 1000;

export function emptyHistory(): History {
    return { undo: [], redo: [] };
}

/** Clears both stacks (switching diagram, reload, import into the open one). */
export function resetHistory(): History {
    return emptyHistory();
}

export function canUndo(history: History): boolean {
    return history.undo.length > 0;
}

export function canRedo(history: History): boolean {
    return history.redo.length > 0;
}

export interface Recorded {
    /** the command that was applied */
    command: Command;
    /** what `apply` returned as its inverse */
    inverse: Command;
    /** time of the edit in ms; also decides merging */
    at: number;
    /** false when the edit changed nothing: it is not recorded */
    changed?: boolean;
    /** a key from `coalesceKey`; steps with the same key may merge */
    key?: string;
    /** never merge this one with the step before it */
    separate?: boolean;
}

/**
 * Records an edit. The redo stack is cleared. If the newest step has the same
 * key and is recent enough, the edit merges into it: the older inverse is kept
 * (it already goes back to before both edits), so no more is stored.
 */
export function record(
    history: History,
    edit: Recorded,
    options: HistoryOptions = {}
): History {
    if (edit.changed === false) return history;
    const limit = options.limit ?? DEFAULT_LIMIT;
    const window = options.mergeWithin ?? DEFAULT_MERGE_WINDOW;
    const top = history.undo[history.undo.length - 1];
    if (
        top &&
        !edit.separate &&
        edit.key !== undefined &&
        top.key === edit.key &&
        edit.at - top.at <= window
    ) {
        const merged: HistoryStep = { ...top, at: edit.at };
        return { undo: [...history.undo.slice(0, -1), merged], redo: [] };
    }
    const undo = [
        ...history.undo,
        { command: edit.inverse, key: edit.key, at: edit.at },
    ];
    return {
        undo:
            limit > 0 && undo.length > limit
                ? undo.slice(undo.length - limit)
                : undo,
        redo: [],
    };
}

export type StepResult =
    | { ok: true; design: Design; history: History }
    | {
          ok: false;
          reason: FailureReason | 'empty';
          message: string;
      };

function move(
    design: Design,
    history: History,
    from: 'undo' | 'redo',
    options: ApplyOptions
): StepResult {
    const source = history[from];
    const step = source[source.length - 1];
    if (!step)
        return {
            ok: false,
            reason: 'empty',
            message: from === 'undo' ? 'Nothing to undo' : 'Nothing to redo',
        };
    const result = apply(design, step.command, options);
    if (!result.ok) return result;
    const back: HistoryStep = { command: result.inverse, at: step.at };
    const rest = source.slice(0, -1);
    return {
        ok: true,
        design: result.design,
        history:
            from === 'undo'
                ? { undo: rest, redo: [...history.redo, back] }
                : { undo: [...history.undo, back], redo: rest },
    };
}

/** Takes the newest step off the undo stack, applies it, and puts its reverse on redo. */
export function undo(
    design: Design,
    history: History,
    options: ApplyOptions = {}
): StepResult {
    return move(design, history, 'undo', options);
}

export function redo(
    design: Design,
    history: History,
    options: ApplyOptions = {}
): StepResult {
    return move(design, history, 'redo', options);
}

export interface DispatchOptions extends ApplyOptions, HistoryOptions {
    /** time of the edit in ms (default: the clock) */
    at?: number;
    /** do not merge with the step before */
    separate?: boolean;
    /** true for edits that must not be undoable (they bypass history) */
    skipHistory?: boolean;
}

export type DispatchResult =
    | { ok: true; design: Design; history: History; changed: boolean }
    | { ok: false; reason: FailureReason; message: string };

/**
 * Applies a command and records it in one go: the way the store edits a
 * design. A refused command changes neither design nor history.
 */
export function dispatch(
    design: Design,
    history: History,
    command: Command,
    options: DispatchOptions = {}
): DispatchResult {
    const result = apply(design, command, options);
    if (!result.ok) return result;
    if (options.skipHistory || !result.changed)
        return {
            ok: true,
            design: result.design,
            history,
            changed: result.changed,
        };
    return {
        ok: true,
        design: result.design,
        changed: true,
        history: record(
            history,
            {
                command,
                inverse: result.inverse,
                at: options.at ?? Date.now(),
                key: coalesceKey(command),
                separate: options.separate,
            },
            options
        ),
    };
}
