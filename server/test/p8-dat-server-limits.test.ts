import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MAX_LISTED_VERSIONS } from '../src/diagrams/routes.js';

const defaults = loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });

describe('DAT-075 the content body limit', () => {
    it('is 25 MB for a diagram by default and 1 MB for ordinary routes', () => {
        expect(defaults.diagramBodyLimit).toBe(25 * 1024 * 1024);
        expect(defaults.bodyLimit).toBe(1024 * 1024);
    });

    it('can be set in megabytes', () => {
        const c = loadConfig({
            DATABASE_URL: 'postgres://u:p@localhost:5432/db',
            DIAGRAM_BODY_LIMIT_MB: '8',
        });
        expect(c.diagramBodyLimit).toBe(8 * 1024 * 1024);
    });
});

describe('DAT-076 / DAT-077 / DAT-081 snapshot numbers', () => {
    it('keeps the newest 200 snapshots by default', () => {
        expect(defaults.snapshotKeep).toBe(200);
    });

    it('auto-publish merges saves that come within five minutes by default', () => {
        expect(defaults.autoPublishCoalesceSeconds).toBe(300);
    });

    it('the version list returns at most 500 versions', () => {
        expect(MAX_LISTED_VERSIONS).toBe(500);
    });
});
