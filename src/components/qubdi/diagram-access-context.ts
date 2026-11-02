import { createContext, useContext } from 'react';
import type { AccessState } from '@/lib/qubdi/access';

export interface DiagramAccessValue {
    access: AccessState;
    /** Look the access up again, e.g. after moving the diagram into a project. */
    refresh: () => void;
}

export const DiagramAccessContext = createContext<DiagramAccessValue>({
    access: { status: 'off' },
    refresh: () => undefined,
});

export const useDiagramAccess = () => useContext(DiagramAccessContext);
