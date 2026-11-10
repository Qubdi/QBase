import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile } from '../src/lib/env-file.js';

describe('loadEnvFile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'envfile-'));
    afterEach(() => {
        delete process.env.QB_TEST_FROM_FILE;
        delete process.env.QB_TEST_ALREADY_SET;
    });

    it('puts the settings of the file into the environment', () => {
        const file = join(dir, 'a.env');
        writeFileSync(file, 'QB_TEST_FROM_FILE=hello\n');
        loadEnvFile(file);
        expect(process.env.QB_TEST_FROM_FILE).toBe('hello');
    });

    it('does not replace a variable that is already set', () => {
        const file = join(dir, 'b.env');
        writeFileSync(file, 'QB_TEST_ALREADY_SET=from-file\n');
        process.env.QB_TEST_ALREADY_SET = 'from-environment';
        loadEnvFile(file);
        expect(process.env.QB_TEST_ALREADY_SET).toBe('from-environment');
    });

    it('is fine with no file at all', () => {
        expect(() => loadEnvFile(join(dir, 'missing.env'))).not.toThrow();
        rmSync(dir, { recursive: true, force: true });
    });
});
