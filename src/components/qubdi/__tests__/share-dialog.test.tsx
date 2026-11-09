import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromLocalInput, toLocalInput } from '@/lib/qubdi/local-datetime';
import { ShareDialog } from '../share-dialog';

const listShareLinks = vi.fn();
const createShareLink = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        listShareLinks: (id: unknown) => listShareLinks(id),
        createShareLink: (...a: unknown[]) => createShareLink(...a),
    },
}));
// the list has its own tests
vi.mock('../share-link-list', () => ({
    ShareLinkList: ({ links }: { links: { id: string }[] | null }) => (
        <div data-testid="link-ids">
            {(links ?? []).map((l) => l.id).join()}
        </div>
    ),
}));

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

    it('ignores a slow reply from an earlier opening', async () => {
        let answerFirst!: (v: unknown) => void;
        listShareLinks
            .mockReset()
            .mockReturnValueOnce(new Promise((r) => (answerFirst = r)))
            .mockResolvedValue([{ id: 'second' }]);
        const ensure = async () => 'r1';
        const tree = (open: boolean) => (
            <ShareDialog
                open={open}
                onOpenChange={() => undefined}
                ensureRemoteId={ensure}
            />
        );
        const view = render(tree(true));
        await settle();
        view.rerender(tree(false));
        view.rerender(tree(true));
        await settle();
        await act(async () => answerFirst([{ id: 'first' }]));
        expect(screen.getByTestId('link-ids').textContent).toBe('second');
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

describe('ShareDialog create link', () => {
    beforeEach(() => {
        listShareLinks.mockReset().mockResolvedValue([]);
        createShareLink.mockReset();
    });

    it('makes one link however often Create link is clicked while it is working', async () => {
        let finish!: (v: unknown) => void;
        createShareLink.mockReturnValue(
            new Promise((resolve) => (finish = resolve))
        );
        render(
            <ShareDialog
                open
                onOpenChange={() => undefined}
                ensureRemoteId={async () => 'r1'}
            />
        );
        await settle();
        const create = screen.getByRole('button', { name: 'Create link' });
        fireEvent.click(create);
        fireEvent.click(create);
        fireEvent.click(create);
        expect(createShareLink).toHaveBeenCalledTimes(1);
        expect((create as HTMLButtonElement).disabled).toBe(true);
        await act(async () => finish({ id: 'l1', token: 't1' }));
        expect((create as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(create);
        expect(createShareLink).toHaveBeenCalledTimes(2);
    });
});

describe('share link expiry field', () => {
    it('shows the local time the link expires at, not its UTC time', () => {
        // 9:30 on 15 January in whatever zone the tests run in
        const iso = new Date(2026, 0, 15, 9, 30).toISOString();
        expect(toLocalInput(iso)).toBe('2026-01-15T09:30');
    });

    it('reads what was typed as local time, so a saved value shows up unchanged', () => {
        const iso = fromLocalInput('2026-07-01T23:15');
        expect(iso).toBe(new Date(2026, 6, 1, 23, 15).toISOString());
        expect(toLocalInput(iso)).toBe('2026-07-01T23:15');
    });

    it('treats empty and unreadable text as no expiry', () => {
        expect(toLocalInput(null)).toBe('');
        expect(toLocalInput('garbage')).toBe('');
        expect(fromLocalInput('')).toBeNull();
        expect(fromLocalInput('not a date')).toBeNull();
    });
});
