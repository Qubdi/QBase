/**
 * The most rows a list route returns when the caller did not ask for a page. A
 * safety net, far above what a team has: it keeps one request from reading a
 * whole table, without a paging screen for lists that are short in practice.
 */
export const MAX_UNPAGED_ROWS = 5000;
