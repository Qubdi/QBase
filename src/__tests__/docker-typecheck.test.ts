import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Found by building the image: .dockerignore drops every test folder, so a
// plain `tsc -b` of the whole project fails there on the missing test helpers.
const read = (file: string) => readFileSync(file, 'utf8');

describe('the image build type-checks only what the image has', () => {
    it('the Dockerfile does not run tsc -b over the tests', () => {
        const docker = read('Dockerfile');
        expect(docker).not.toMatch(/RUN npx tsc -b/);
        expect(docker).toContain('npx tsc -p tsconfig.image.json');
    });

    it('tsconfig.image.json leaves out every folder .dockerignore drops', () => {
        const ignore = read('.dockerignore');
        const config = JSON.parse(read('tsconfig.image.json')) as {
            exclude: string[];
        };
        for (const dir of ['**/__tests__/', '**/test/', '**/tests/'])
            expect(ignore).toContain(dir);
        for (const dir of ['**/__tests__/**', '**/test/**', '**/tests/**'])
            expect(config.exclude).toContain(dir);
    });
});
