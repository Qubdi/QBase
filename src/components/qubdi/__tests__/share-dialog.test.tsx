import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareDialog } from '../share-dialog';

const listShareLinks = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { listShareLinks: (id: unknown) => listShareLinks(id) },
}));
// the list has its own tests
vi.mock('../share-link-list', () => ({ ShareLinkList: () => null }));

const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

describe('ShareDialog loading', () => {
    beforeEach(() => {
        listShareLinks.mockReset();
        listShareLinks.mockResolvedValue([]);
    });

    it('loads the links once when it opens, however often the parent re-renders', async () => {
        const first = vi.fn(async () => 'r1');
        const view = render(
            <ShareDialog
                open
                onOpenChange={() => undefined}
                ensureRemoteId={first}
            />
        );
        await settle();
        expect(first).toHaveBeenCalledTimes(1);
        expect(listShareLinks).toHaveBeenCalledTimes(1);
        // a parent that makes a new function every render must not restart the load
        for (let n = 0; n < 3; n++) {
            view.rerender(
                <ShareDialog
                    open
                    onOpenChange={() => undefined}
                    ensureRemoteId={async () => 'r1'}
                />
            );
            await settle();
        }
        expect(listShareLinks).toHaveBeenCalledTimes(1);
    });

    it('does nothing while closed, and loads again the next time it opens', async () => {
        const ensure = vi.fn(async () => 'r1');
        const view = render(
            <ShareDialog
                open={false}
                onOpenChange={() => undefined}
                ensureRemoteId={ensure}
            />
        );
        await settle();
        expect(ensure).not.toHaveBeenCalled();
        view.rerender(
            <ShareDialog
                open
                onOpenChange={() => undefined}
                ensureRemoteId={ensure}
            />
        );
        await settle();
        view.rerender(
            <ShareDialog
                open={false}
                onOpenChange={() => undefined}
                ensureRemoteId={ensure}
            />
        );
        await settle();
        view.rerender(
            <ShareDialog
                open
                onOpenChange={() => undefined}
                ensureRemoteId={ensure}
            />
        );
        await settle();
        expect(listShareLinks).toHaveBeenCalledTimes(2);
    });
});
