import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../src/cli/lint.js';

const run = (json: unknown) => {
    let out = '';
    let err = '';
    const io: CliIo = {
        readFile: () => JSON.stringify(json),
        out: (t) => (out += t),
        err: (t) => (err += t),
    };
    return { code: runCli(['d.json'], io), out, err };
};

const field = { id: 'f', name: 'id', type: { name: 'integer' }, primaryKey: true, unique: false, nullable: false };

describe('lint CLI input shape', () => {
    it('exits 2, not a crash, for a table without fields', () => {
        const r = run({ tables: [{ id: 't', name: 'users' }] });
        expect(r.code).toBe(2);
        expect(r.err).toMatch(/table "users" has no "fields" array/);
    });

    it('exits 2 for the same fault inside the server wrapper', () => {
        const r = run({ title: 'x', content: { tables: [{ id: 't', name: 'users', fields: 'nope' }] } });
        expect(r.code).toBe(2);
        expect(r.err).toMatch(/cannot read input/);
    });

    it('exits 2 for a table that is not an object, a field without a type, and bad indexes', () => {
        expect(run({ tables: [null] }).code).toBe(2);
        expect(run({ tables: [{ id: 't', name: 'a', fields: [{ id: 'f', name: 'id' }] }] }).code).toBe(2);
        expect(run({ tables: [{ id: 't', name: 'a', fields: [field], indexes: [{ id: 'i' }] }] }).code).toBe(2);
        expect(run({ tables: [{ id: 't', name: 'a', fields: [field] }], relationships: {} }).code).toBe(2);
    });

    it('still lints a well formed diagram', () => {
        const r = run({ tables: [{ id: 't', name: 'users', fields: [field] }] });
        expect([0, 1]).toContain(r.code);
        expect(r.err).toBe('');
    });
});
