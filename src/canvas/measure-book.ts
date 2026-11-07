import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { Id } from '@/core/model/id';
import type { Size } from '@/core/model/region-membership';

export interface MeasureState {
    sizes: Readonly<Record<Id, Size>>;
    /** records a size; false when it is the same as the known one */
    report(id: Id, size: Size): boolean;
    forget(id: Id): void;
}

export type MeasureBook = StoreApi<MeasureState>;

const same = (a: Size | undefined, b: Size) =>
    a !== undefined && a.width === b.width && a.height === b.height;

/**
 * The drawn size of each entity. It is kept here, next to the canvas, and not
 * in the editor store (see the hand-back note): the store's `ui` slice has no
 * place for it yet.
 */
export function createMeasureBook(): MeasureBook {
    return createStore<MeasureState>()((set, get) => ({
        sizes: {},
        report(id, size) {
            const rounded = {
                width: Math.round(size.width),
                height: Math.round(size.height),
            };
            if (same(get().sizes[id], rounded)) return false;
            set((s) => ({ sizes: { ...s.sizes, [id]: rounded } }));
            return true;
        },
        forget(id) {
            if (!(id in get().sizes)) return;
            set((s) => {
                const sizes = { ...s.sizes };
                delete sizes[id];
                return { sizes };
            });
        },
    }));
}
