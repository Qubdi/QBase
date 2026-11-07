import { useEffect, useState } from 'react';

/** The value, held back until it has stood still for `delayMs`. */
export function useDebounced<T>(value: T, delayMs: number): T {
    const [held, setHeld] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setHeld(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return held;
}
