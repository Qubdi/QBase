import { useSyncExternalStore } from 'react';

/**
 * A picture of the diagram needs every table and link in the page, not only the
 * ones inside the window (the canvas draws just those, to stay fast). The export
 * holds this switch while it captures; the surface draws everything meanwhile.
 */
let holds = 0;
const listeners = new Set<() => void>();

const changed = () => listeners.forEach((listener) => listener());

/** Asks the canvas to draw all of it. Returns the function that lets go. */
export function holdFullRender(): () => void {
    holds += 1;
    changed();
    let released = false;
    return () => {
        if (released) return;
        released = true;
        holds -= 1;
        changed();
    };
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/** true while an export wants every node drawn */
export function useFullRender(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => holds > 0,
        () => false
    );
}
