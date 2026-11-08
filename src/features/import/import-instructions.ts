import type { DatabaseType } from '@/core/model/database';
import type { ImportMethod } from './import-method';

/** A command that exports a schema as SQL text, with a filled-in example. */
export interface DumpCommand {
    tool: string;
    template: string;
    example: string;
}

const PG: DumpCommand = {
    tool: 'pg_dump',
    template:
        'pg_dump -h <host> -p <port> -d <database_name>\n  -U <username> -s -F p -E UTF-8\n  -f <output_file_path>',
    example:
        'pg_dump -h localhost -p 5432 -d my_db\n  -U postgres -s -F p -E UTF-8\n  -f schema_export.sql',
};
const MYSQL: DumpCommand = {
    tool: 'mysqldump',
    template:
        'mysqldump -h <host> -P <port> -u <username> -p\n  --no-data --routines <database_name>\n  > <output_file_path>',
    example:
        'mysqldump -h localhost -P 3306 -u root -p\n  --no-data --routines my_db\n  > schema_export.sql',
};
const SQLITE: DumpCommand = {
    tool: 'sqlite3',
    template: 'sqlite3 <database_file> .schema\n  > <output_file_path>',
    example: 'sqlite3 my_db.sqlite .schema\n  > schema_export.sql',
};

/** The export command shown on the SQL Script tab, when one is known for the database. */
export const dumpCommandFor = (type: DatabaseType): DumpCommand | undefined => {
    switch (type) {
        case 'postgresql':
            return PG;
        case 'mysql':
        case 'mariadb':
            return MYSQL;
        case 'sqlite':
            return SQLITE;
        default:
            return undefined;
    }
};

/** Running the query script through psql instead of a database client. */
export const PSQL_COMMAND =
    'psql -h <host> -p <port> -U <username>\n  -d <database_name> -t -A\n  -f <script_file>';

/** A short sample for the DBML tab. */
export const DBML_SAMPLE = `Table users {
  id int [pk]
  username varchar
  email varchar
}

Table posts {
  id int [pk]
  user_id int [ref: > users.id]
  title varchar
  content text
}`;

/** Which databases have the DB Client / PSQL switch. */
export const hasPsqlTab = (type: DatabaseType, method: ImportMethod): boolean =>
    method === 'metadata' && type === 'postgresql';
