import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
    readFileSync(resolve(__dirname, '..', file), 'utf8');

// The DBML parser is by far the heaviest part of the editor. These files sit
// on the path every editor visit loads, so they may only reach it through
// import(), which makes the browser fetch it when the feature is first used.
describe('the DBML parser is not part of the main editor load', () => {
    it.each([
        [
            'pages/editor-page/side-panel/side-panel.tsx',
            ['./dbml-section/dbml-section'],
        ],
        [
            'context/dialog-context/dialog-provider.tsx',
            [
                '@/dialogs/create-diagram-dialog/create-diagram-dialog',
                '@/dialogs/import-database-dialog/import-database-dialog',
            ],
        ],
    ])('%s loads its DBML screens on demand', (file, modules) => {
        const source = read(file);
        for (const module of modules) {
            // type-only imports are erased, so only value imports count
            expect(source).not.toMatch(
                new RegExp(`^import (?!type)[^;]*from '${module}';`, 'm')
            );
            expect(source).toContain(`import('${module}')`);
        }
    });
});
