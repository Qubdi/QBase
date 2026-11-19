import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/qubdi/api';
import type { RemoteShareLink } from '@/lib/qubdi/api';
import { ShareDialog } from '../share-dialog';

const api = vi.hoisted(() => ({
    listShareLinks: vi.fn(),
    createShareLink: vi.fn(),
    updateShareLink: vi.fn(),
    revokeShareLink: vi.fn(),
    regenerateShareLink: vi.fn(),
}));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api,
}));

const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

const link = (extra: Partial<RemoteShareLink> = {}): RemoteShareLink => ({
    id: 'l1',
    diagramId: 'r1',
    access: 'anyone',
    expiresAt: null,
    live: false,
    createdAt: new Date().toISOString(),
    revokedAt: null,
    ...extra,
});

const show = async (
    ensure: () => Promise<string> = async () => 'r1',
    onOpenChange = vi.fn()
) => {
    render(
        <ShareDialog open onOpenChange={onOpenChange} ensureRemoteId={ensure} />
    );
    await settle();
    return { onOpenChange };
};

const createButton = () => screen.getByRole('button', { name: 'Create link' });
const urlField = () => screen.getByLabelText('Share URL') as HTMLInputElement;

const writeText = vi.fn();
const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
beforeEach(() => {
    Object.values(api).forEach((m) => m.mockReset());
    api.listShareLinks.mockResolvedValue([]);
    api.updateShareLink.mockResolvedValue({});
    api.revokeShareLink.mockResolvedValue({});
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
    });
});
afterEach(() => {
    vi.useRealTimers();
    if (realClipboard)
        Object.defineProperty(navigator, 'clipboard', realClipboard);
});

describe('ShareDialog when the server cannot help', () => {
    it('says the server cannot be reached when the diagram cannot be put on it, and offers no Create', async () => {
        await show(async () => {
            throw new TypeError('Failed to fetch');
        });
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Could not reach the server.'
        );
        expect(createButton()).toBeDisabled();
        // the list stops saying it is loading
        expect(screen.queryByText('Loading…')).toBeNull();
        expect(api.listShareLinks).not.toHaveBeenCalled();
    });

    it('shows the server reason when the links cannot be listed, but still allows a new link', async () => {
        api.listShareLinks.mockRejectedValue(new ApiError(403, 'forbidden'));
        await show();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'You do not have permission to do that.'
        );
        expect(createButton()).toBeEnabled();
    });

    it('shows a failed change, and clears the message once the next one works', async () => {
        api.listShareLinks.mockResolvedValue([link()]);
        api.updateShareLink.mockRejectedValueOnce(new ApiError(500, 'boom'));
        await show();
        fireEvent.click(screen.getByLabelText('Live updates'));
        await settle();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Request failed (boom).'
        );
        // the list is not reloaded after a failed change
        expect(api.listShareLinks).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByLabelText('Live updates'));
        await settle();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(api.listShareLinks).toHaveBeenCalledTimes(2);
    });

    it('shows a failed new link and keeps the button usable', async () => {
        api.createShareLink.mockRejectedValue(new ApiError(429, 'too_many'));
        await show();
        fireEvent.click(createButton());
        await settle();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Request failed (too_many).'
        );
        expect(createButton()).toBeEnabled();
    });
});

describe('ShareDialog links', () => {
    it('says there are no links yet', async () => {
        await show();
        expect(
            screen.getByText('This diagram has no share links.')
        ).toBeInTheDocument();
    });

    it('leaves revoked links out', async () => {
        api.listShareLinks.mockResolvedValue([
            link({ id: 'gone', revokedAt: new Date().toISOString() }),
        ]);
        await show();
        expect(
            screen.getByText('This diagram has no share links.')
        ).toBeInTheDocument();
    });

    it('shows the address of a link whose token the server kept', async () => {
        api.listShareLinks.mockResolvedValue([link({ token: 'kept' })]);
        await show();
        expect(new URL(urlField().value).pathname).toBe('/s/kept');
        expect(urlField()).toHaveAttribute('readonly');
    });

    it('says an address cannot be shown again, until it is regenerated', async () => {
        api.listShareLinks.mockResolvedValue([link()]);
        api.regenerateShareLink.mockResolvedValue({
            ...link(),
            token: 'fresh',
        });
        await show();
        expect(screen.getByText(/cannot be shown again/)).toBeInTheDocument();
        expect(screen.queryByLabelText('Share URL')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
        await settle();
        expect(api.regenerateShareLink).toHaveBeenCalledWith('r1', 'l1');
        expect(new URL(urlField().value).pathname).toBe('/s/fresh');
        expect(api.listShareLinks).toHaveBeenCalledTimes(2);
    });

    it('selects the whole address when the field is focused', async () => {
        api.listShareLinks.mockResolvedValue([link({ token: 'kept' })]);
        await show();
        const select = vi.spyOn(urlField(), 'select');
        fireEvent.focus(urlField());
        expect(select).toHaveBeenCalled();
    });

    it('revokes a link only after it is confirmed, then reloads the list', async () => {
        api.listShareLinks
            .mockResolvedValueOnce([link({ token: 'kept' })])
            .mockResolvedValue([]);
        await show();
        const list = screen.getByRole('list', { name: 'Share links' });
        fireEvent.click(within(list).getByRole('button', { name: 'Revoke' }));
        expect(api.revokeShareLink).not.toHaveBeenCalled();
        fireEvent.click(
            within(list).getByRole('button', { name: 'Yes, revoke' })
        );
        await settle();
        expect(api.revokeShareLink).toHaveBeenCalledWith('r1', 'l1');
        expect(
            screen.getByText('This diagram has no share links.')
        ).toBeInTheDocument();
    });

    it('a failed revoke says why and keeps the link', async () => {
        api.listShareLinks.mockResolvedValue([link({ token: 'kept' })]);
        api.revokeShareLink.mockRejectedValue(new ApiError(404, 'not_found'));
        await show();
        fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
        fireEvent.click(screen.getByRole('button', { name: 'Yes, revoke' }));
        await settle();
        expect(screen.getByRole('alert')).toHaveTextContent('Not found.');
        expect(urlField()).toBeInTheDocument();
    });

    it('does not save an expiry field that was left unchanged', async () => {
        api.listShareLinks.mockResolvedValue([link()]);
        await show();
        fireEvent.blur(screen.getByLabelText('Expires'));
        await settle();
        expect(api.updateShareLink).not.toHaveBeenCalled();
    });

    it('clearing the expiry saves "no expiry"', async () => {
        api.listShareLinks.mockResolvedValue([
            link({ expiresAt: '2031-05-01T10:00:00.000Z' }),
        ]);
        await show();
        const field = screen.getByLabelText('Expires');
        fireEvent.change(field, { target: { value: '' } });
        fireEvent.blur(field);
        await settle();
        expect(api.updateShareLink).toHaveBeenCalledWith('r1', 'l1', {
            expiresAt: null,
        });
    });

    it('turns live updates off for a live link', async () => {
        api.listShareLinks.mockResolvedValue([link({ live: true })]);
        await show();
        fireEvent.click(screen.getByLabelText('Live updates'));
        await settle();
        expect(api.updateShareLink).toHaveBeenCalledWith('r1', 'l1', {
            live: false,
        });
    });
});

describe('ShareDialog copy', () => {
    it('copies the address, says "Copied" aloud and on the button, then goes back after two seconds', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        api.listShareLinks.mockResolvedValue([link({ token: 'kept' })]);
        await show();
        fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
        await settle();
        expect(writeText).toHaveBeenCalledWith(urlField().value);
        expect(
            screen.getByRole('button', { name: 'Copied' })
        ).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Copied');
        act(() => void vi.advanceTimersByTime(2000));
        expect(
            screen.getByRole('button', { name: 'Copy link' })
        ).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('asks for a manual copy when the clipboard refuses', async () => {
        writeText.mockRejectedValue(new Error('denied'));
        api.listShareLinks.mockResolvedValue([link({ token: 'kept' })]);
        await show();
        fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
        await settle();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Copy failed. Select the link and copy it manually.'
        );
        expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
    });
});

describe('ShareDialog closing', () => {
    it('Escape asks the parent to close it', async () => {
        const { onOpenChange } = await show();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('starts clean on the next opening: an earlier error is gone', async () => {
        const ensure = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new TypeError('offline'))
            .mockResolvedValue('r1');
        const tree = (open: boolean) => (
            <ShareDialog
                open={open}
                onOpenChange={() => undefined}
                ensureRemoteId={ensure}
            />
        );
        const view = render(tree(true));
        await settle();
        expect(screen.getByRole('alert')).toBeInTheDocument();
        view.rerender(tree(false));
        view.rerender(tree(true));
        await settle();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(
            screen.getByText('This diagram has no share links.')
        ).toBeInTheDocument();
    });
});
