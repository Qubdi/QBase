import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    planFieldHandles,
    resetPendingForTests,
    scheduleOncePerFrame,
    type FieldHandleInput,
} from '../table-node-field-handles';

const base: FieldHandleInput = {
    isConnectable: true,
    focused: false,
    isRelationshipSource: false,
    connectionInProgress: false,
    isTarget: false,
    numberOfEdgesToField: 0,
};

const plan = (over: Partial<FieldHandleInput> = {}) =>
    planFieldHandles({ ...base, ...over });

describe('planFieldHandles', () => {
    it('gives an idle field with no relationships no handles at all', () => {
        expect(plan()).toMatchObject({
            source: false,
            targets: 0,
            dropZone: false,
        });
    });

    it('mounts source handles while the table is focused, so a line can be dragged out', () => {
        expect(plan({ focused: true }).source).toBe(true);
        expect(plan({ focused: false }).source).toBe(false);
    });

    it('keeps source handles for a field a relationship starts at, even when not focused', () => {
        expect(plan({ isRelationshipSource: true }).source).toBe(true);
    });

    it('mounts one target handle for each line that ends at the field', () => {
        expect(plan({ numberOfEdgesToField: 3 }).targets).toBe(3);
        expect(plan({ numberOfEdgesToField: 1 }).targets).toBe(1);
    });

    it('does not mount a spare target handle when nothing is being dragged', () => {
        const p = plan({ numberOfEdgesToField: 2 });
        expect(p.dropZone).toBe(false);
        expect(p.targets).toBe(2);
    });

    it('shows the row-covering drop zone only while a line is dragged onto this table', () => {
        const p = plan({
            connectionInProgress: true,
            isTarget: true,
            numberOfEdgesToField: 1,
        });
        expect(p.dropZone).toBe(true);
        expect(p.targets).toBe(1);
    });

    it('hides target handles on tables that cannot receive the line being dragged', () => {
        const p = plan({
            connectionInProgress: true,
            isTarget: false,
            numberOfEdgesToField: 4,
        });
        expect(p.targets).toBe(0);
        expect(p.dropZone).toBe(false);
    });

    it('gives a view-like (not connectable) field nothing', () => {
        const p = plan({
            isConnectable: false,
            focused: true,
            isRelationshipSource: true,
            numberOfEdgesToField: 2,
            connectionInProgress: true,
            isTarget: true,
        });
        expect(p).toMatchObject({ source: false, targets: 0, dropZone: false });
    });

    describe('layoutKey, the cue to measure the handles again', () => {
        it('changes when source handles appear or disappear (focus)', () => {
            expect(plan({ focused: true }).layoutKey).not.toBe(
                plan({ focused: false }).layoutKey
            );
        });

        it('changes when a line is added to or removed from the field', () => {
            expect(plan({ numberOfEdgesToField: 1 }).layoutKey).not.toBe(
                plan({ numberOfEdgesToField: 2 }).layoutKey
            );
        });

        it('stays the same when only the drop zone toggles', () => {
            const idle = plan({ numberOfEdgesToField: 1 });
            const dragging = plan({
                numberOfEdgesToField: 1,
                connectionInProgress: true,
                isTarget: true,
            });
            expect(dragging.dropZone).toBe(true);
            expect(dragging.layoutKey).toBe(idle.layoutKey);
        });

        it('stays the same when focus changes but the field keeps its source handles', () => {
            expect(
                plan({ isRelationshipSource: true, focused: true }).layoutKey
            ).toBe(
                plan({ isRelationshipSource: true, focused: false }).layoutKey
            );
        });
    });
});

describe('scheduleOncePerFrame', () => {
    beforeEach(() => resetPendingForTests());

    it('runs the update once for many requests in the same frame', () => {
        const update = vi.fn();
        const frames: Array<() => void> = [];
        const raf = (cb: () => void) => frames.push(cb);
        for (let i = 0; i < 25; i++) scheduleOncePerFrame('t1', update, raf);
        expect(frames).toHaveLength(1);
        frames[0]();
        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith('t1');
    });

    it('keeps tables apart', () => {
        const update = vi.fn();
        const frames: Array<() => void> = [];
        const raf = (cb: () => void) => frames.push(cb);
        scheduleOncePerFrame('t1', update, raf);
        scheduleOncePerFrame('t2', update, raf);
        scheduleOncePerFrame('t1', update, raf);
        frames.forEach((f) => f());
        expect(update.mock.calls.map((c) => c[0]).sort()).toEqual(['t1', 't2']);
    });

    it('can ask again in the next frame', () => {
        const update = vi.fn();
        const frames: Array<() => void> = [];
        const raf = (cb: () => void) => frames.push(cb);
        scheduleOncePerFrame('t1', update, raf);
        frames.shift()!();
        scheduleOncePerFrame('t1', update, raf);
        frames.shift()!();
        expect(update).toHaveBeenCalledTimes(2);
    });
});
