// tsc does not copy the SQL migrations next to the compiled server
import { cpSync } from 'node:fs';

cpSync('src/db/migrations', 'dist/server/src/db/migrations', {
    recursive: true,
});
