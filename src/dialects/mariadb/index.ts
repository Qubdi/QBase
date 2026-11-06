import type { Dialect } from '../dialect';
import { mysql } from '../mysql';

/** MariaDB: MySQL's reader and writer plus uuid and bool. */
export const mariadb: Dialect = {
    ...mysql,
    id: 'mariadb',
    label: 'MariaDB',
    variantOf: 'mysql',
    types: [...mysql.types, 'uuid', 'bool'],
};
