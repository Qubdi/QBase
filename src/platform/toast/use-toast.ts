import * as React from 'react';
import type { ReactNode } from 'react';

export interface ToastOptions {
    title?: ReactNode;
    description?: ReactNode;
    variant?: 'default' | 'destructive';
    /** A `<ToastAction>` element. */
    action?: ReactNode;
    layout?: 'row' | 'column';
    hideCloseButton?: boolean;
}

export interface ToastItem extends ToastOptions {
    id: string;
    open: boolean;
}

// How many toasts are shown at once, and how long a closed one stays mounted
// so that its exit animation can play.
const MAX_VISIBLE = 3;
const REMOVE_DELAY_MS = 1000;

// The list lives outside React so that `toast()` works from any code and every
// `useToast()` caller sees the same list.
let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const removeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function publish(next: ToastItem[]) {
    items = next;
    listeners.forEach((l) => l());
}

function dismiss(id?: string) {
    const ids = id ? [id] : items.map((i) => i.id);
    publish(items.map((i) => (ids.includes(i.id) ? { ...i, open: false } : i)));
    for (const target of ids) {
        if (removeTimers.has(target)) continue;
        removeTimers.set(
            target,
            setTimeout(() => {
                removeTimers.delete(target);
                publish(items.filter((i) => i.id !== target));
            }, REMOVE_DELAY_MS)
        );
    }
}

function toast(options: ToastOptions) {
    counter += 1;
    const id = String(counter);
    publish([{ ...options, id, open: true }, ...items].slice(0, MAX_VISIBLE));
    return {
        id,
        dismiss: () => dismiss(id),
        update: (next: ToastOptions) =>
            publish(items.map((i) => (i.id === id ? { ...i, ...next } : i))),
    };
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

const getSnapshot = () => items;

function useToast() {
    const toasts = React.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getSnapshot
    );
    return { toasts, toast, dismiss };
}

/** For tests: drop every toast and pending timer. */
function resetToasts() {
    removeTimers.forEach(clearTimeout);
    removeTimers.clear();
    publish([]);
}

export { useToast, toast, resetToasts };
