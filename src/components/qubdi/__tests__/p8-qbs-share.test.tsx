import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareDialog } from '../share-dialog';

const listShareLinks = vi.fn();
const createShareLink = vi.fn();
const updateShareLink = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        listShareLinks: (id: unknown) => listShareLinks(id),
        createShareLink: (...a: unknown[]) => createShareLink(...a),
        updateShareLink: (...a: unknown[]) => updateShareLink(...a),
        regenerateShareLink: vi.fn(),
    },
}));

const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

const existing = {
    id: 'l1',
    diagramId: 'r1',
    access: 'anyone',
    expiresAt: null,
    live: false,
    createdAt: new Date().toISOString(),
    revokedAt: null,
};

const show = (ensure = vi.fn(async () => 'r1')) => {
    render(
        <ShareDialog
            open
            onOpenChange={() => undefined}
            ensureRemoteId={ensure}
        />
    );
    return ensure;
};

beforeEach(() => {
    listShareLinks.mockReset().mockResolvedValue([]);
    createShareLink.mockReset();
    updateShareLink.mockReset().mockResolvedValue({});
});

describe('QBS-033 sharing: the diagram is on the server first, then links with their options', () => {
    it('puts the diagram on the server before listing or creating links', async () => {
        const order: string[] = [];
        const ensure = vi.fn(async () => {
            order.push('ensure');
            return 'r1';
        });
        listShareLinks.mockImplementation(async () => {
            order.push('list');
            return [];
        });
        createShareLink.mockImplementation(async () => {
            order.push('create');
            return { id: 'l9', token: 'tok-9' };
        });
        show(ensure);
        await settle();
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await settle();
        expect(order.slice(0, 2)).toEqual(['ensure', 'list']);
        expect(order).toContain('create');
        expect(createShareLink).toHaveBeenCalledWith('r1', {});
    });

    it('a new link shows an address that opens /s/<token>', async () => {
        createShareLink.mockResolvedValue({ id: 'l9', token: 'tok-9' });
        listShareLinks
            .mockResolvedValueOnce([])
            .mockResolvedValue([{ ...existing, id: 'l9' }]);
        show();
        await settle();
        fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
        await settle();
        const url = screen.getByLabelText('Share URL') as HTMLInputElement;
        expect(new URL(url.value).pathname).toBe('/s/tok-9');
    });

    it('can set who may open it: anyone, signed-in users, or off', async () => {
        listShareLinks.mockResolvedValue([existing]);
        show();
        await settle();
        const select = screen.getByRole('combobox', {
            name: 'Who can open this link',
        });
        fireEvent.click(select);
        fireEvent.click(
            await screen.findByRole('option', { name: 'Signed-in users' })
        );
        await settle();
        expect(updateShareLink).toHaveBeenCalledWith('r1', 'l1', {
            access: 'signed_in',
        });
    });

    it('can turn live updates on', async () => {
        listShareLinks.mockResolvedValue([existing]);
        show();
        await settle();
        fireEvent.click(screen.getByLabelText('Live updates'));
        await settle();
        expect(updateShareLink).toHaveBeenCalledWith('r1', 'l1', {
            live: true,
        });
    });

    it('can set an end date, saved when the field is left', async () => {
        listShareLinks.mockResolvedValue([existing]);
        show();
        await settle();
        const field = screen.getByLabelText('Expires') as HTMLInputElement;
        fireEvent.change(field, { target: { value: '2030-01-15T09:30' } });
        expect(updateShareLink).not.toHaveBeenCalled();
        fireEvent.blur(field);
        await settle();
        const patch = updateShareLink.mock.calls[0][2] as { expiresAt: string };
        expect(new Date(patch.expiresAt).getTime()).toBe(
            new Date(2030, 0, 15, 9, 30).getTime()
        );
    });
});
