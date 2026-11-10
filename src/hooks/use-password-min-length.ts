import { useEffect, useState } from 'react';
import { api } from '@/lib/qubdi/api';
import {
    DEFAULT_PASSWORD_MIN_LENGTH,
    normalizeMinLength,
} from '../../shared/password';

// one answer per page load: the server's setting does not change while the page is open
let known: Promise<number> | null = null;

const fetchMinLength = (): Promise<number> => {
    known ??= Promise.resolve()
        .then(() => api.setupStatus())
        .then((r) => normalizeMinLength(r.passwordMinLength))
        .catch(() => {
            // try again next time; meanwhile the default is the best guess
            known = null;
            return DEFAULT_PASSWORD_MIN_LENGTH;
        });
    return known;
};

/**
 * The fewest characters the server asks of a new password (its
 * PASSWORD_MIN_LENGTH). Until the answer arrives, or if it cannot be had, it is
 * the default: the server checks the password in any case.
 */
export const usePasswordMinLength = (enabled = true): number => {
    const [minLength, setMinLength] = useState(DEFAULT_PASSWORD_MIN_LENGTH);
    useEffect(() => {
        if (!enabled) return;
        let live = true;
        void fetchMinLength().then((n) => live && setMinLength(n));
        return () => {
            live = false;
        };
    }, [enabled]);
    return minLength;
};
