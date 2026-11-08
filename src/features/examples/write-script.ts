import type { DatabaseType } from '@/core/model/database';
import { parseColumn } from './spec';
import type { Domain, ParsedColumn } from './spec';

interface Table {
    name: string;
    columns: ParsedColumn[];
}

/** The tables in an order where every table comes after the ones it points to. */
function ordered(domain: Domain): Table[] {
    const tables = domain.tables.map((t) => ({
        name: t.name,
        columns: t.columns.map(parseColumn),
    }));
    const byName = new Map(tables.map((t) => [t.name, t]));
    const done = new Set<string>();
    const out: Table[] = [];
    const visiting = new Set<string>();
    const visit = (t: Table) => {
        if (done.has(t.name)) return;
        if (visiting.has(t.name))
            throw new Error(`tables point at each other around ${t.name}`);
        visiting.add(t.name);
        for (const c of t.columns) {
            const target = c.references && byName.get(c.references.table);
            if (c.references && !target)
                throw new Error(
                    `${t.name}.${c.name} points to a table that is not there: ${c.references.table}`
                );
            if (target && target !== t) visit(target);
        }
        visiting.delete(t.name);
        done.add(t.name);
        out.push(t);
    };
    tables.forEach(visit);
    return out;
}

/** The type a column has once a foreign key is resolved to its target. */
function resolve(
    column: ParsedColumn,
    byName: Map<string, Table>,
    tableName: string
): string {
    if (column.type !== 'fk') return column.type;
    const ref = column.references!;
    const target = byName
        .get(ref.table)!
        .columns.find((c) => c.name === ref.column);
    if (!target)
        throw new Error(
            `${tableName}.${column.name} points to ${ref.table}.${ref.column}, which is not there`
        );
    return target.type === 'fk'
        ? resolve(target, byName, ref.table)
        : target.type;
}

type Words = {
    id: string;
    fkId: string;
    int: string;
    big: string;
    small: string;
    text: string;
    str: (n: number) => string;
    date: string;
    time: string;
    ts: string;
    bool: string;
    dec: (p: string, s: string) => string;
    uuid: string;
    json: string;
    bin: string;
};

const PG: Words = {
    id: 'serial PRIMARY KEY',
    fkId: 'integer',
    int: 'integer',
    big: 'bigint',
    small: 'smallint',
    text: 'text',
    str: (n) => `varchar(${n})`,
    date: 'date',
    time: 'time',
    ts: 'timestamp',
    bool: 'boolean',
    dec: (p, s) => `numeric(${p}, ${s})`,
    uuid: 'uuid',
    json: 'jsonb',
    bin: 'bytea',
};
const MYSQL: Words = {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    fkId: 'INT',
    int: 'INT',
    big: 'BIGINT',
    small: 'SMALLINT',
    text: 'TEXT',
    str: (n) => `VARCHAR(${n})`,
    date: 'DATE',
    time: 'TIME',
    ts: 'DATETIME',
    bool: 'BOOLEAN',
    dec: (p, s) => `DECIMAL(${p}, ${s})`,
    uuid: 'CHAR(36)',
    json: 'JSON',
    bin: 'BLOB',
};
const WORDS: Partial<Record<DatabaseType, Words>> = {
    postgresql: PG,
    mysql: MYSQL,
    mariadb: MYSQL,
    sqlite: {
        id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
        fkId: 'INTEGER',
        int: 'INTEGER',
        big: 'INTEGER',
        small: 'INTEGER',
        text: 'TEXT',
        str: (n) => `VARCHAR(${n})`,
        date: 'DATE',
        time: 'TIME',
        ts: 'DATETIME',
        bool: 'BOOLEAN',
        dec: (p, s) => `NUMERIC(${p}, ${s})`,
        uuid: 'TEXT',
        json: 'TEXT',
        bin: 'BLOB',
    },
    sql_server: {
        id: 'INT IDENTITY(1, 1) PRIMARY KEY',
        fkId: 'INT',
        int: 'INT',
        big: 'BIGINT',
        small: 'SMALLINT',
        text: 'NVARCHAR(MAX)',
        str: (n) => `NVARCHAR(${n})`,
        date: 'DATE',
        time: 'TIME',
        ts: 'DATETIME2',
        bool: 'BIT',
        dec: (p, s) => `DECIMAL(${p}, ${s})`,
        uuid: 'UNIQUEIDENTIFIER',
        json: 'NVARCHAR(MAX)',
        bin: 'VARBINARY(MAX)',
    },
    oracle: {
        id: 'NUMBER(10) PRIMARY KEY',
        fkId: 'NUMBER(10)',
        int: 'NUMBER(10)',
        big: 'NUMBER(19)',
        small: 'NUMBER(5)',
        text: 'CLOB',
        str: (n) => `VARCHAR2(${n})`,
        date: 'DATE',
        time: 'VARCHAR2(8)',
        ts: 'TIMESTAMP',
        bool: 'NUMBER(1)',
        dec: (p, s) => `NUMBER(${p}, ${s})`,
        uuid: 'CHAR(36)',
        json: 'CLOB',
        bin: 'BLOB',
    },
    cockroachdb: {
        id: 'UUID PRIMARY KEY DEFAULT gen_random_uuid()',
        fkId: 'UUID',
        int: 'INT4',
        big: 'INT8',
        small: 'INT2',
        text: 'STRING',
        str: (n) => `VARCHAR(${n})`,
        date: 'DATE',
        time: 'TIME',
        ts: 'TIMESTAMP',
        bool: 'BOOL',
        dec: (p, s) => `DECIMAL(${p}, ${s})`,
        uuid: 'UUID',
        json: 'JSONB',
        bin: 'BYTES',
    },
};

const CLICKHOUSE: Words = {
    id: 'UInt32',
    fkId: 'UInt32',
    int: 'Int32',
    big: 'Int64',
    small: 'Int16',
    text: 'String',
    str: () => 'String',
    date: 'Date',
    time: 'String',
    ts: 'DateTime',
    bool: 'Bool',
    dec: (p, s) => `Decimal(${p}, ${s})`,
    uuid: 'UUID',
    json: 'String',
    bin: 'String',
};

function word(w: Words, type: string): string {
    if (type === 'id') return w.id;
    const m = /^str(\d+)$/.exec(type);
    if (m) return w.str(Number(m[1]));
    const d = /^dec(\d+),(\d+)$/.exec(type);
    if (d) return w.dec(d[1], d[2]);
    return (w as unknown as Record<string, string>)[type];
}

/** The type of a key column that other tables point to, without its key clauses. */
function plainType(w: Words, type: string): string {
    return type === 'id' ? w.fkId : word(w, type);
}

/** Which language the text of this domain is written in. */
export function formatOf(databaseType: DatabaseType): 'sql' | 'dbml' {
    return databaseType === 'clickhouse' ? 'dbml' : 'sql';
}

/** The SQL, or the DBML for ClickHouse, of the domain's tables. */
export function writeScript(domain: Domain): string {
    const tables = ordered(domain);
    const byName = new Map(tables.map((t) => [t.name, t]));
    if (domain.databaseType === 'clickhouse') return writeDbml(tables, byName);
    const w = WORDS[domain.databaseType];
    if (!w) throw new Error(`no SQL words for ${domain.databaseType}`);
    let fk = 0;
    return (
        tables
            .map((t) => {
                const lines: string[] = [];
                const composite = t.columns.filter(
                    (c) => c.pk && c.type !== 'id'
                );
                for (const c of t.columns) {
                    const type = resolve(c, byName, t.name);
                    const own = c.type === 'id';
                    const sql = own ? w.id : plainType(w, type);
                    const parts = [c.name, sql];
                    if (c.notNull && !own && !c.pk) parts.push('NOT NULL');
                    if (c.unique) parts.push('UNIQUE');
                    lines.push(parts.join(' '));
                }
                if (composite.length > 0)
                    lines.push(
                        `PRIMARY KEY (${composite.map((c) => c.name).join(', ')})`
                    );
                for (const c of t.columns)
                    if (c.references)
                        lines.push(
                            `${domain.databaseType === 'oracle' ? `CONSTRAINT fk_${++fk} ` : ''}FOREIGN KEY (${c.name}) REFERENCES ${c.references.table} (${c.references.column})`
                        );
                return `CREATE TABLE ${t.name} (\n    ${lines.join(',\n    ')}\n);`;
            })
            .join('\n') + '\n'
    );
}

function writeDbml(tables: Table[], byName: Map<string, Table>): string {
    const w = CLICKHOUSE;
    const refs: string[] = [];
    const blocks = tables.map((t) => {
        const composite = t.columns.filter((c) => c.pk && c.type !== 'id');
        const lines = t.columns.map((c) => {
            const type = resolve(c, byName, t.name);
            const flags: string[] = [];
            if (c.type === 'id') flags.push('pk');
            else if (c.notNull) flags.push('not null');
            if (c.unique) flags.push('unique');
            if (c.references)
                refs.push(
                    `Ref: ${t.name}.${c.name} > ${c.references.table}.${c.references.column}`
                );
            return `  ${c.name} ${plainType(w, type)}${flags.length ? ` [${flags.join(', ')}]` : ''}`;
        });
        const indexes =
            composite.length > 0
                ? `\n  indexes {\n    (${composite.map((c) => c.name).join(', ')}) [pk]\n  }`
                : '';
        return `Table ${t.name} {\n${lines.join('\n')}${indexes}\n}`;
    });
    return `${blocks.join('\n\n')}\n\n${refs.join('\n')}\n`;
}
