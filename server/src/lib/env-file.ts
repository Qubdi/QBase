/**
 * Reads settings from a `.env` file into the environment, without replacing a
 * variable that is already set: real environment variables win. A missing
 * file is not an error (Docker passes everything as variables).
 */
export function loadEnvFile(path = '.env'): void {
    try {
        process.loadEnvFile(path);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
}
