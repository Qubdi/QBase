import React from 'react';
import { render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blank, NOW } from '@/core/testing/helpers';
import { createEntityParts } from '@/core/model/defaults';
import { EditorStoreProvider } from './editor-provider';
import { useEditorStoreApi } from './store-context';
import type { EditorStore } from './editor-store';

const addTable = (name: string) => ({
    type: 'entity.insert' as const,
    parts: createEntityParts(blank(), { name, now: NOW }),
});

const grabbed: { store?: EditorStore } = {};
const Grab: React.FC = () => {
    const api = useEditorStoreApi();
    React.useEffect(() => {
        grabbed.store = api;
    }, [api]);
    return null;
};
const edit = (name: string) =>
    act(() => {
        grabbed.store!.getState().edit(addTable(name));
    });

const open = (readonly = false) => {
    const save = vi.fn(async () => undefined);
    const view = render(
        <EditorStoreProvider
            design={blank()}
            now={() => NOW}
            adapter={{ save }}
            readonly={readonly}
        >
            <Grab />
        </EditorStoreProvider>
    );
    return { save, ...view };
};

const leaving = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
};

describe('CLI-117: leaving the page inside the autosave pause', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('writes the last edit when the page is hidden for good', async () => {
        const { save } = open();
        edit('a');
        expect(save).not.toHaveBeenCalled();
        await act(async () => {
            window.dispatchEvent(new Event('pagehide'));
        });
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('writes it when the tab goes to the background', async () => {
        const { save } = open();
        edit('a');
        const hidden = vi
            .spyOn(document, 'visibilityState', 'get')
            .mockReturnValue('hidden');
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        hidden.mockRestore();
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('asks before leaving while there are unsaved edits, and not otherwise', async () => {
        open();
        expect(leaving()).toBe(false);
        edit('a');
        expect(leaving()).toBe(true);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1500);
        });
        expect(leaving()).toBe(false);
    });

    it('does not ask in a read-only session', () => {
        open(true);
        expect(leaving()).toBe(false);
    });

    it('stops listening once the editor is closed', async () => {
        const { unmount } = open();
        edit('a');
        await act(async () => {
            unmount();
        });
        expect(leaving()).toBe(false);
    });
});
