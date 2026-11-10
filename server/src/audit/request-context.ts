import { AsyncLocalStorage } from 'node:async_hooks';

/** The id of the request being served, so a log line written deep in a helper can name it. */
export const requestIds = new AsyncLocalStorage<string>();
