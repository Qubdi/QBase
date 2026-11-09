import { INDEX_METHODS } from '@/core/model/index-methods';
import type { KeyMethod } from '@/core/model/key';
import type { Flavour, Neutral } from './contract';

/** How an index is spelled in the target, and what had to be given up. */
export interface IndexOut {
    /** words after CREATE: `UNIQUE `, `FULLTEXT `, `NONCLUSTERED COLUMNSTORE `... */
    head: string;
    /** between the table name and the column list: PostgreSQL's ` USING GIN` */
    between: string;
    /** after the column list: MySQL's ` USING HASH` */
    tail: string;
    /** the type was not kept: the index is a regular one */
    regular: boolean;
    /** what to tell the reader */
    note?: string;
}

/** What the target needs to know about the index and its table. */
export interface IndexSurrounding {
    /** the neutral kind of each indexed column */
    kinds: readonly Neutral['kind'][];
    /** the table has a primary key */
    hasPrimaryKey: boolean;
    /** SQL Server: this index is the one clustered index the table may have */
    mayBeClustered: boolean;
}

/** Types that are the plain index of every database: nothing to say about them. */
const PLAIN = new Set<string>(['btree', 'index', 'nonclustered']);

const label = (flavour: Flavour): string =>
    ({
        postgres: 'PostgreSQL',
        mysql: 'MySQL',
        sqlserver: 'SQL Server',
        sqlite: 'SQLite',
        oracle: 'Oracle',
    })[flavour];

const TARGET_DATABASE = {
    postgres: 'postgresql',
    mysql: 'mysql',
    sqlserver: 'sql_server',
    sqlite: 'sqlite',
    oracle: 'oracle',
} as const;

/**
 * The index type for the target (EXP-049): kept when the target has the same
 * type and it can be made, else a regular index with a note that says why.
 */
export function convertIndex(
    method: KeyMethod | undefined,
    unique: boolean,
    target: Flavour,
    around: IndexSurrounding
): IndexOut {
    const u = unique ? 'UNIQUE ' : '';
    const plain = (note?: string): IndexOut => ({
        head: u,
        between: '',
        tail: '',
        regular: true,
        ...(note ? { note } : {}),
    });
    const offered = INDEX_METHODS[TARGET_DATABASE[target]];
    const asked = method ?? 'btree';
    const name = label(target);
    // a type that is the plain index everywhere says nothing; SQL Server writes it out
    if (PLAIN.has(asked)) {
        if (target === 'sqlserver' && asked === 'nonclustered')
            return { ...plain(), head: `${u}NONCLUSTERED `, regular: false };
        return plain();
    }
    if (!offered.includes(asked))
        return plain(`${asked} index created as a regular index`);
    const refuses = (why: string): IndexOut =>
        plain(`${asked} index created as a regular index (${why})`);
    switch (target) {
        case 'postgres':
            if (unique)
                return refuses(`only a btree index can be unique in ${name}`);
            if (asked === 'hash' && around.kinds.length > 1)
                return refuses(`a hash index in ${name} takes one column`);
            return {
                head: '',
                between: ` USING ${asked.toUpperCase()}`,
                tail: '',
                regular: false,
            };
        case 'mysql':
            if (asked === 'hash')
                return {
                    head: u,
                    between: '',
                    tail: ' USING HASH',
                    regular: false,
                };
            if (unique)
                return refuses(`a ${asked} index cannot be unique in ${name}`);
            return {
                head: `${asked.toUpperCase()} `,
                between: '',
                tail: '',
                regular: false,
            };
        case 'sqlserver':
            if (asked === 'clustered')
                return around.mayBeClustered
                    ? {
                          head: `${u}CLUSTERED `,
                          between: '',
                          tail: '',
                          regular: false,
                      }
                    : refuses(
                          `a table has only one clustered index in ${name}`
                      );
            if (asked === 'columnstore')
                return unique
                    ? refuses(`a columnstore index cannot be unique in ${name}`)
                    : {
                          head: 'NONCLUSTERED COLUMNSTORE ',
                          between: '',
                          tail: '',
                          regular: false,
                      };
            // xml
            if (
                unique ||
                around.kinds.length !== 1 ||
                around.kinds[0] !== 'xml'
            )
                return refuses(`an xml index in ${name} takes one xml column`);
            if (!around.hasPrimaryKey)
                return refuses(`an xml index in ${name} needs a primary key`);
            return {
                head: 'PRIMARY XML ',
                between: '',
                tail: '',
                regular: false,
            };
        case 'oracle':
            return unique
                ? refuses(`a bitmap index cannot be unique in ${name}`)
                : {
                      head: 'BITMAP ',
                      between: '',
                      tail: '',
                      regular: false,
                  };
        default:
            return plain();
    }
}
