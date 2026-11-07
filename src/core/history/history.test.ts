import { describe, expect, it } from 'vitest';
import type { Command } from '../commands/command';
import type { Design } from '../model/design';
import { rng, NOW, sameButDate, withTables } from '../testing/helpers';
import { planAddEntity, planDeleteEntities } from '../commands/plan-entity';
import {
    canRedo,
    canUndo,
    dispatch,
    emptyHistory,
    redo,
    resetHistory,
    undo,
} from './history';
import type { History } from './history';

function run(
    design: Design,
    history: History,
    command: Command,
    at = NOW,
    extra = {}
) {
    const r = dispatch(design, history, command, { now: NOW, at, ...extra });
    if (!r.ok) throw new Error(r.message);
    return r;
}

function back(design: Design, history: History) {
    const r = undo(design, history, { now: NOW });
    if (!r.ok) throw new Error(r.message);
    return r;
}

function forward(design: Design, history: History) {
    const r = redo(design, history, { now: NOW });
    if (!r.ok) throw new Error(r.message);
    return r;
}

describe('EDT-219 undo and redo', () => {
    it('start disabled and become available after an edit', () => {
        const h = emptyHistory();
        expect(canUndo(h)).toBe(false);
        expect(canRedo(h)).toBe(false);
        const d = withTables(['a']);
        const r = run(d, h, { type: 'design.rename', name: 'One' });
        expect(canUndo(r.history)).toBe(true);
        expect(canRedo(r.history)).toBe(false);
    });

    it('undo then redo go back and forth through a run of different edits', () => {
        const start = withTables(['a', 'b']);
        let design = start;
        let history = emptyHistory();
        const states: Design[] = [design];
        const edits: Command[] = [
            { type: 'design.rename', name: 'Renamed' },
            planAddEntity(design, { now: NOW, random: rng(1) }),
            {
                type: 'entity.move',
                moves: [{ id: design.entities.order[0], x: 50, y: 60 }],
            },
            planDeleteEntities([design.entities.order[1]]),
        ];
        edits.forEach((command, i) => {
            const r = run(design, history, command, NOW + i * 10_000);
            design = r.design;
            history = r.history;
            states.push(design);
        });
        for (let i = edits.length - 1; i >= 0; i--) {
            const r = back(design, history);
            design = r.design;
            history = r.history;
            expect(sameButDate(design, states[i])).toEqual(states[i]);
        }
        expect(canUndo(history)).toBe(false);
        expect(canRedo(history)).toBe(true);
        for (let i = 1; i <= edits.length; i++) {
            const r = forward(design, history);
            design = r.design;
            history = r.history;
            expect(sameButDate(design, states[i])).toEqual(states[i]);
        }
        expect(canRedo(history)).toBe(false);
    });

    it('nothing to undo or redo is a clear refusal, not an error', () => {
        const d = withTables(['a']);
        expect(undo(d, emptyHistory())).toMatchObject({
            ok: false,
            reason: 'empty',
        });
        expect(redo(d, emptyHistory())).toMatchObject({
            ok: false,
            reason: 'empty',
        });
    });
});

describe('EDT-220 a new action clears the redo stack', () => {
    it('drops what could be redone', () => {
        const d = withTables(['a']);
        let r = run(d, emptyHistory(), { type: 'design.rename', name: 'One' });
        const u = back(r.design, r.history);
        expect(canRedo(u.history)).toBe(true);
        r = run(u.design, u.history, { type: 'design.rename', name: 'Two' });
        expect(canRedo(r.history)).toBe(false);
    });
});

describe('EDT-224 steps: a drag, typing and groups are one step each', () => {
    it('a group is one step however many commands it has', () => {
        const d = withTables(['a', 'b', 'c']);
        const r = run(d, emptyHistory(), planDeleteEntities(d.entities.order));
        expect(r.history.undo).toHaveLength(1);
        const u = back(r.design, r.history);
        expect(sameButDate(u.design, d)).toEqual(d);
    });

    it('typing in one field merges edits that follow each other closely', () => {
        const d = withTables(['a']);
        const id = d.entities.order[0];
        let design = d;
        let history = emptyHistory();
        for (const [i, name] of ['n', 'ne', 'new', 'new_'].entries()) {
            const r = run(
                design,
                history,
                { type: 'entity.update', id, patch: { name } },
                NOW + i * 200
            );
            design = r.design;
            history = r.history;
        }
        expect(design.entities.byId[id].name).toBe('new_');
        expect(history.undo).toHaveLength(1);
        const u = back(design, history);
        expect(u.design.entities.byId[id].name).toBe('a');
        const again = forward(u.design, u.history);
        expect(again.design.entities.byId[id].name).toBe('new_');
    });

    it('a pause starts a new step', () => {
        const d = withTables(['a']);
        const id = d.entities.order[0];
        let r = run(
            d,
            emptyHistory(),
            { type: 'entity.update', id, patch: { name: 'x' } },
            NOW
        );
        r = run(
            r.design,
            r.history,
            { type: 'entity.update', id, patch: { name: 'xy' } },
            NOW + 5000
        );
        expect(r.history.undo).toHaveLength(2);
    });

    it('different fields or tables do not merge', () => {
        const d = withTables(['a', 'b']);
        const [a, b] = d.entities.order;
        let r = run(
            d,
            emptyHistory(),
            { type: 'entity.update', id: a, patch: { name: 'x' } },
            NOW
        );
        r = run(
            r.design,
            r.history,
            { type: 'entity.update', id: a, patch: { comments: 'c' } },
            NOW + 10
        );
        r = run(
            r.design,
            r.history,
            { type: 'entity.update', id: b, patch: { comments: 'c' } },
            NOW + 20
        );
        expect(r.history.undo).toHaveLength(3);
    });

    it('structural edits never merge, and "separate" forces a new step', () => {
        const d = withTables(['a']);
        let r = run(
            d,
            emptyHistory(),
            { type: 'design.rename', name: 'a' },
            NOW
        );
        r = run(
            r.design,
            r.history,
            { type: 'design.rename', name: 'b' },
            NOW + 10,
            { separate: true }
        );
        expect(r.history.undo).toHaveLength(2);
        let s = run(
            d,
            emptyHistory(),
            planAddEntity(d, { random: rng(1) }),
            NOW
        );
        s = run(
            s.design,
            s.history,
            planAddEntity(s.design, { random: rng(2) }),
            NOW + 10
        );
        expect(s.history.undo).toHaveLength(2);
    });

    it('an edit that changes nothing is not recorded', () => {
        const d = withTables(['a']);
        const r = run(d, emptyHistory(), {
            type: 'design.rename',
            name: d.name,
        });
        expect(r.history.undo).toHaveLength(0);
        expect(r.changed).toBe(false);
    });
});

describe('EDT-222 depth and reset', () => {
    it('the oldest step falls off past the limit', () => {
        let design = withTables(['a']);
        let history = emptyHistory();
        for (let i = 0; i < 12; i++) {
            const r = run(
                design,
                history,
                { type: 'design.rename', name: `n${i}` },
                NOW + i * 5000,
                { limit: 5 }
            );
            design = r.design;
            history = r.history;
        }
        expect(history.undo).toHaveLength(5);
        let steps = 0;
        while (canUndo(history)) {
            const r = back(design, history);
            design = r.design;
            history = r.history;
            steps++;
        }
        expect(steps).toBe(5);
        expect(design.name).toBe('n6');
    });

    it('reset empties both stacks', () => {
        const d = withTables(['a']);
        const r = run(d, emptyHistory(), { type: 'design.rename', name: 'z' });
        const u = back(r.design, r.history);
        expect(canRedo(u.history)).toBe(true);
        const cleared = resetHistory();
        expect(canUndo(cleared) || canRedo(cleared)).toBe(false);
    });
});

describe('EDT-225 actions that bypass history', () => {
    it('skipHistory changes the design without a step', () => {
        const d = withTables(['a']);
        const r = run(
            d,
            emptyHistory(),
            { type: 'design.rename', name: 'quiet' },
            NOW,
            { skipHistory: true }
        );
        expect(r.design.name).toBe('quiet');
        expect(canUndo(r.history)).toBe(false);
    });
});

describe('EDT-014 / EDT-274 refusals leave design and history alone', () => {
    it('read-only', () => {
        const d = withTables(['a']);
        const r = dispatch(
            d,
            emptyHistory(),
            { type: 'design.rename', name: 'x' },
            { readOnly: true }
        );
        expect(r).toMatchObject({ ok: false, reason: 'read-only' });
        const u = undo(
            d,
            {
                undo: [
                    { command: { type: 'design.rename', name: 'x' }, at: 0 },
                ],
                redo: [],
            },
            { readOnly: true }
        );
        expect(u).toMatchObject({ ok: false, reason: 'read-only' });
    });

    it('a bad command', () => {
        const d = withTables(['a']);
        expect(
            dispatch(d, emptyHistory(), { type: 'entity.remove', id: 'nope' })
        ).toMatchObject({ ok: false, reason: 'not-found' });
    });
});

describe('review core-store 18: a step that can never apply is dropped', () => {
    it('does not leave the failing step on top of the stack', () => {
        const d = withTables(['a']);
        const history = {
            undo: [
                {
                    command: { type: 'design.rename' as const, name: 'x' },
                    at: 0,
                },
                {
                    command: { type: 'entity.remove' as const, id: 'gone' },
                    at: 1,
                },
            ],
            redo: [],
        };
        const r = undo(d, history);
        expect(r).toMatchObject({ ok: false, reason: 'not-found' });
        if (r.ok) return;
        expect(r.history?.undo).toHaveLength(1);
        expect(undo(d, r.history!)).toMatchObject({ ok: true });
    });
});
