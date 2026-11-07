import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import type { Design } from '@/core/model/design';
import { splitStatements } from '@/dialects/shared/statements';
import { lex } from '@/dialects/shared/tokenizer';
import { exportSql } from './export-sql';
import { importSql } from './import-sql';

const ents = (d: Design) => listOf(d.entities);
const cols = (d: Design, name: string) => {
    const e = ents(d).find((x) => x.name === name)!;
    return e.columnIds.map((id) => d.columns[id]);
};
const messages = (r: { diagnostics: { message: string }[] }) =>
    r.diagnostics.map((d) => d.message).join('\n');

describe('review core-store 1: case-insensitive names and loud drops', () => {
    const script = `CREATE TABLE Users (Id int primary key, Name text);
CREATE TABLE orders (id int primary key, userid int);
ALTER TABLE ORDERS ADD FOREIGN KEY (USERID) REFERENCES users(id);
ALTER TABLE users ADD COLUMN Email text;
CREATE INDEX ix_name ON USERS (name);
COMMENT ON TABLE users IS 'people';
COMMENT ON COLUMN users.NAME IS 'full name';`;

    it('resolves ALTER, INDEX, COMMENT and REFERENCES ignoring case', () => {
        const r = importSql(script, 'postgresql');
        const d = r.design!;
        expect(r.counts.relationships).toBe(1);
        expect(cols(d, 'Users').map((c) => c.name)).toEqual([
            'Id',
            'Name',
            'Email',
        ]);
        const users = ents(d).find((e) => e.name === 'Users')!;
        expect(users.keyIds.map((k) => d.keys[k].label)).toContain('ix_name');
        expect(users.comments).toBe('people');
        expect(cols(d, 'Users')[1].comments).toBe('full name');
    });

    it('reports every reference that cannot be resolved', () => {
        const r = importSql(
            `CREATE TABLE a (id int);
ALTER TABLE ghost ADD COLUMN x int;
CREATE INDEX i ON ghost (x);
COMMENT ON TABLE ghost IS 'x';
ALTER TABLE a ADD FOREIGN KEY (id) REFERENCES ghost(id);`,
            'postgresql'
        );
        const m = messages(r);
        expect(m).toMatch(/ALTER TABLE ignored: table ghost/);
        expect(m).toMatch(/Index i ignored: table ghost/);
        expect(m).toMatch(/COMMENT ON ignored: table ghost/);
        expect(m).toMatch(/Foreign key on a dropped/);
    });

    it('keeps an ALTER foreign key even when the holder is unknown to ALTER', () => {
        const r = importSql(
            `CREATE TABLE a (id int primary key);
CREATE TABLE b (id int primary key, a_id int);
ALTER TABLE b ADD FOREIGN KEY (a_id) REFERENCES a(id);`,
            'postgresql'
        );
        expect(r.counts.relationships).toBe(1);
    });
});

describe('review core-store 4: key, period, exclude, like as column names', () => {
    it('imports them as columns', () => {
        const r = importSql(
            `CREATE TABLE settings (id int primary key, key text, value text, period int, exclude boolean, "like" text, index int);`,
            'postgresql'
        );
        expect(cols(r.design!, 'settings').map((c) => c.name)).toEqual([
            'id',
            'key',
            'value',
            'period',
            'exclude',
            'like',
            'index',
        ]);
    });
    it('still reads real constraints', () => {
        const r = importSql(
            `CREATE TABLE t (id int, name varchar(10), KEY idx_n (name), PRIMARY KEY (id), KEY (id));`,
            'mysql'
        );
        const d = r.design!;
        expect(cols(d, 't').map((c) => c.name)).toEqual(['id', 'name']);
        const e = ents(d)[0];
        expect(e.keyIds.map((k) => d.keys[k].label)).toContain('idx_n');
    });
    it('MySQL key varchar(10) is a column', () => {
        const r = importSql(
            `CREATE TABLE t (id int, key varchar(10));`,
            'postgresql'
        );
        expect(cols(r.design!, 't').map((c) => c.name)).toEqual(['id', 'key']);
    });
});

describe('review core-store 10: export filter uses the design schema', () => {
    it('a PG design with schema-less tables filtered to public exports to MySQL', () => {
        const d = importSql(
            'CREATE TABLE a (id int primary key);',
            'postgresql'
        ).design!;
        const r = exportSql(d, 'mysql', {
            filter: { schemaIds: ['public'] } as never,
        });
        expect(r.diagnostics).toEqual([]);
        expect(r.text).toContain('`a`');
    });
});

describe('review core-store 14: END IF does not close a procedure block', () => {
    it('keeps the procedure in one statement', () => {
        const sql = `CREATE PROCEDURE p() BEGIN IF x THEN SELECT 1; END IF; SELECT 2; END;
CREATE TABLE t (id int);`;
        const parts = splitStatements(
            lex(sql, {
                identifierQuotes: ['`'],
                hashComments: true,
                dollarStrings: false,
                backslashEscapes: true,
            }).tokens,
            false
        );
        expect(parts).toHaveLength(2);
    });
    it('handles END CASE and END LOOP', () => {
        const sql = `CREATE FUNCTION f() BEGIN CASE WHEN a THEN SELECT 1; END CASE; LOOP SELECT 2; END LOOP; END;
CREATE TABLE t (id int);`;
        const parts = splitStatements(
            lex(sql, {
                identifierQuotes: ['`'],
                hashComments: true,
                dollarStrings: false,
                backslashEscapes: true,
            }).tokens,
            false
        );
        expect(parts).toHaveLength(2);
    });
});

describe('review core-store 15: other silent drops', () => {
    it('warns on a duplicate column', () => {
        const r = importSql('CREATE TABLE t (a int, a text);', 'postgresql');
        expect(messages(r)).toMatch(/Column a is defined twice/);
    });
    it('drops an index with unresolved members with a warning', () => {
        const r = importSql(
            'CREATE TABLE t (a int); CREATE UNIQUE INDEX ix ON t (a, nope);',
            'postgresql'
        );
        expect(messages(r)).toMatch(/Index ix on t dropped/);
        const e = ents(r.design!)[0];
        expect(e.keyIds).toHaveLength(0);
    });
    it('does not drop CREATE TABLE users after public.users', () => {
        const r = importSql(
            'CREATE TABLE public.users (id int); CREATE TABLE users (id int);',
            'postgresql'
        );
        expect(ents(r.design!)).toHaveLength(2);
    });
    it('warns on an unqualified reference matching several schemas', () => {
        const r = importSql(
            `CREATE TABLE a.users (id int primary key);
CREATE TABLE b.users (id int primary key);
CREATE TABLE c.t (uid int REFERENCES users(id));`,
            'postgresql'
        );
        expect(messages(r)).toMatch(/several schemas have it/);
    });
    it('prefers the same schema for an unqualified reference', () => {
        const r = importSql(
            `CREATE TABLE a.users (id int primary key);
CREATE TABLE b.users (id int primary key);
CREATE TABLE b.t (uid int REFERENCES users(id));`,
            'postgresql'
        );
        const d = r.design!;
        const link = d.links.byId[d.links.order[0]];
        expect(d.entities.byId[link.sourceEntityId].schema).toBe('b');
        expect(messages(r)).not.toMatch(/several schemas/);
    });
});
