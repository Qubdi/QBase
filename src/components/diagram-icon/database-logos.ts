import postgresql from '@/assets/databases/postgresql.png';
import postgresqlDark from '@/assets/databases/postgresql-dark.png';
import postgresqlIcon from '@/assets/databases/postgresql-icon.png';
import mysql from '@/assets/databases/mysql.png';
import mysqlDark from '@/assets/databases/mysql-dark.png';
import mysqlIcon from '@/assets/databases/mysql-icon.png';
import mariadb from '@/assets/databases/mariadb.png';
import mariadbDark from '@/assets/databases/mariadb-dark.png';
import mariadbIcon from '@/assets/databases/mariadb-icon.png';
import sqlite from '@/assets/databases/sqlite.png';
import sqliteDark from '@/assets/databases/sqlite-dark.png';
import sqliteIcon from '@/assets/databases/sqlite-icon.png';
import sqlServer from '@/assets/databases/sql-server.png';
import sqlServerDark from '@/assets/databases/sql-server-dark.png';
import sqlServerIcon from '@/assets/databases/sql-server-icon.png';
import oracle from '@/assets/databases/oracle.png';
import oracleDark from '@/assets/databases/oracle-dark.png';
import oracleIcon from '@/assets/databases/oracle-icon.png';

/** The pictures of one database: the large logo (light and dark page) and the small icon. */
interface LogoSet {
    light: string;
    dark: string;
    icon: string;
}

const LOGOS: Record<string, LogoSet> = {
    postgresql: {
        light: postgresql,
        dark: postgresqlDark,
        icon: postgresqlIcon,
    },
    mysql: { light: mysql, dark: mysqlDark, icon: mysqlIcon },
    mariadb: { light: mariadb, dark: mariadbDark, icon: mariadbIcon },
    sqlite: { light: sqlite, dark: sqliteDark, icon: sqliteIcon },
    sql_server: {
        light: sqlServer,
        dark: sqlServerDark,
        icon: sqlServerIcon,
    },
    oracle: { light: oracle, dark: oracleDark, icon: oracleIcon },
};

/** The large logo for the database picker; undefined for an unknown database. */
export function databaseLogo(
    type: string | null | undefined,
    theme: 'light' | 'dark'
): string | undefined {
    const set = LOGOS[type ?? ''];
    return set ? set[theme] : undefined;
}

/** The small icon of a database (the diagram name bar, the lists); an unknown database gets the PostgreSQL one. */
export function databaseIcon(type: string | null | undefined): string {
    return (LOGOS[type ?? ''] ?? LOGOS.postgresql).icon;
}
