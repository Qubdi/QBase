import { useEffect, useState } from 'react';
import { api } from '@/lib/qubdi/api';

// one answer per page load: the server's settings do not change while the page is open
let known: Promise<boolean> | null = null;

const fetchAvailable = (): Promise<boolean> => {
    known ??= Promise.resolve()
        .then(() => api.setupStatus())
        .then((r) => r.mfaAvailable === true)
        .catch(() => {
            // try again next time; meanwhile it is simply not offered
            known = null;
            return false;
        });
    return known;
};

/**
 * Whether the server offers two-factor sign-in (it is switched on and has a
 * key). Until that is known, and when the server cannot be asked, it is not
 * offered: the menu entry and the dialog stay out of the way.
 */
export const useMfaAvailable = (enabled = true): boolean => {
    const [available, setAvailable] = useState(false);
    useEffect(() => {
        if (!enabled) return;
        let live = true;
        void fetchAvailable().then((a) => live && setAvailable(a));
        return () => {
            live = false;
        };
    }, [enabled]);
    return available;
};
