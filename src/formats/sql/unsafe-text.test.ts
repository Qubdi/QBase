import { describe, expect, it } from 'vitest';
import { sampleS1 } from '@/dialects/testing/sample-designs';
import { breaksStatement } from './unsafe-text';
import { exportSql } from './export-sql';

describe('breaksStatement', () => {
    it('finds a statement break outside quotes only', () => {
        for (const text of [
            'a; b',
            'a -- c',
            'a /* c',
            'f(a))',
            'f(a',
            "'open",
        ])
            expect(breaksStatement(text), text).toBe(true);
        for (const text of ["'a;b'", 'f(a, g(b))', "'it''s'", '1 + 2'])
            expect(breaksStatement(text), text).toBe(false);
    });
});

describe('export refuses text that would end its statement (CLI-023, 024, 086)', () => {
    const exported = (
        edit: (c: ReturnType<typeof columnOf>) => void,
        to: 'postgresql' | 'mysql' | 'sql_server' | 'sqlite' = 'postgresql'
    ) => {
        const design = sampleS1('postgresql');
        edit(columnOf(design));
        return exportSql(design, to);
    };
    const columnOf = (design: ReturnType<typeof sampleS1>) =>
        Object.values(design.columns).find((c) => c.name === 'full_name')!;

    it('a type name with a statement in it', () => {
        const r = exported(
            (c) =>
                void (c.type = { ...c.type, name: 'text); DROP TABLE x; --' })
        );
        expect(r.text).toBe('');
        expect(r.diagnostics[0].message).toMatch(/type .* cannot be written/);
    });

    it('a function-call default that carries a second statement', () => {
        const r = exported(
            (c) => void (c.default = 'now(); DROP TABLE customers')
        );
        expect(r.text).toBe('');
        expect(r.diagnostics[0].message).toMatch(/default value/);
    });

    it('a generated expression with a sub-query, in every target dialect', () => {
        for (const to of [
            'postgresql',
            'mysql',
            'sql_server',
            'sqlite',
        ] as const) {
            const r = exported(
                (c) =>
                    void (c.generated = {
                        expression: '(select 1); drop table x',
                        stored: true,
                    }),
                to
            );
            expect(r.text, to).toBe('');
            expect(r.diagnostics.length, to).toBeGreaterThan(0);
        }
    });

    it('still writes ordinary types, defaults and expressions', () => {
        const r = exported((c) => void (c.default = "'hello; world'"));
        expect(r.text).toContain("DEFAULT 'hello; world'");
        expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    });
});
