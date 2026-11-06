import type { Diagnostic } from '@/dialects/script-model';

export type { Diagnostic };

export const hasErrors = (list: readonly Diagnostic[]): boolean =>
    list.some((d) => d.severity === 'error');

export const error = (message: string): Diagnostic => ({
    severity: 'error',
    message,
});
export const warning = (message: string): Diagnostic => ({
    severity: 'warning',
    message,
});
