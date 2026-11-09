import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TOOL = path.resolve('tools/similarity.mjs');
let dir;

const write = (name, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
};
const lines = (make, count = 40) =>
    Array.from({ length: count }, (_, i) => make(i)).join('\n') + '\n';

/** Runs the tool inside the fixture folder; paths are relative to it. */
const run = (...args) => {
    const res = spawnSync(process.execPath, [TOOL, ...args], {
        cwd: dir,
        encoding: 'utf8',
    });
    return { code: res.status, out: res.stdout + res.stderr };
};

describe('tools/similarity.mjs', () => {
    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'similarity-'));
        write(
            'up/a.ts',
            lines((i) => `const line${i} = ${i};`)
        );
        write(
            'work/own.ts',
            lines((i) => `function own${i}() { return 'mine${i}'; }`)
        );
        write(
            'work/copy.ts',
            lines((i) => `const line${i} = ${i};`)
        );
        write('list-ok.txt', 'work/own.ts\n');
        write('list-gone.txt', 'work/own.ts\nwork/missing.ts\n');
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    const base = ['--upstream', 'up', '--src', 'work/own.ts', '--check'];

    it('passes for an original file', () => {
        const res = run(...base, '--all');
        expect(res.code).toBe(0);
        expect(res.out).toContain('No checked file is over the limits');
    });

    it('fails for a file copied from upstream', () => {
        const res = run(
            '--upstream',
            'up',
            '--src',
            'work/copy.ts',
            '--check',
            '--all'
        );
        expect(res.code).toBe(1);
        expect(res.out).toContain('work/copy.ts');
    });

    it('refuses a --rewritten or --allow file that is not there', () => {
        for (const flag of ['--rewritten', '--allow']) {
            const res = run(...base, flag, 'nope.txt');
            expect(res.code).toBe(2);
            expect(res.out).toContain(`${flag} file not found`);
        }
    });

    it('refuses a --rewritten list that names a path that does not exist', () => {
        const res = run(...base, '--rewritten', 'list-gone.txt');
        expect(res.code).toBe(2);
        expect(res.out).toContain('work/missing.ts');
    });

    it('accepts a --rewritten list of paths that exist', () => {
        expect(run(...base, '--rewritten', 'list-ok.txt').code).toBe(0);
    });
});
