import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembersDialog } from '../members-dialog';

const listMembers = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { listMembers: (id: unknown) => listMembers(id) },
}));

const member = (email: string) => ({ userId: email, email, role: 'editor' });

const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

const tree = (open: boolean, remoteId = 'r1') => (
    <MembersDialog
        open={open}
        onOpenChange={() => undefined}
        remoteId={remoteId}
    />
);

describe('MembersDialog loading', () => {
    beforeEach(() => listMembers.mockReset());

    it('lists the members of the diagram when it opens', async () => {
        listMembers.mockResolvedValue([member('a@b.c')]);
        render(tree(true));
        await settle();
        expect(screen.getByText('a@b.c')).toBeTruthy();
        expect(listMembers).toHaveBeenCalledWith('r1');
    });

    it('shows nothing of the last opening while the next one loads', async () => {
        listMembers.mockResolvedValueOnce([member('old@b.c')]);
        const view = render(tree(true));
        await settle();
        listMembers.mockReturnValueOnce(new Promise(() => undefined));
        view.rerender(tree(false));
        view.rerender(tree(true));
        await settle();
        expect(screen.queryByText('old@b.c')).toBeNull();
    });

    it('ignores a slow reply from an earlier opening', async () => {
        let answerFirst!: (v: unknown) => void;
        listMembers
            .mockReturnValueOnce(new Promise((r) => (answerFirst = r)))
            .mockResolvedValueOnce([member('second@b.c')]);
        const view = render(tree(true));
        await settle();
        view.rerender(tree(false));
        view.rerender(tree(true));
        await settle();
        await act(async () => answerFirst([member('first@b.c')]));
        expect(screen.getByText('second@b.c')).toBeTruthy();
        expect(screen.queryByText('first@b.c')).toBeNull();
    });
});
