import { describe, expect, it } from 'vitest';
import { MSSQL_SKIP_NOTICE, mssqlRequired } from './introspect-mssql-fixture.js';

describe('when the SQL Server tests may skip', () => {
    it('skips on a developer machine with nothing set', () => {
        expect(mssqlRequired({})).toBe(false);
    });

    it('is required when asked for', () => {
        expect(mssqlRequired({ REQUIRE_MSSQL: '1' })).toBe(true);
        expect(mssqlRequired({ REQUIRE_MSSQL: '0' })).toBe(false);
    });

    it('is required in CI once the job has set the container password', () => {
        expect(mssqlRequired({ CI: 'true', MSSQL_SA_PASSWORD: 'x' })).toBe(true);
    });

    it('still skips in a CI job with no SQL Server set up, and the notice says how to run it', () => {
        expect(mssqlRequired({ CI: 'true' })).toBe(false);
        expect(MSSQL_SKIP_NOTICE).toMatch(/docker-compose\.mssql\.yml/);
        expect(MSSQL_SKIP_NOTICE).toMatch(/REQUIRE_MSSQL=1/);
    });

    it('does not take a password alone outside CI as a requirement', () => {
        expect(mssqlRequired({ MSSQL_SA_PASSWORD: 'x' })).toBe(false);
    });
});
