import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderInEditor } from '@/workspace/__tests__/test-harness';
import { CaptureError } from '../capture-image';
import type { ImageExportRequest } from '../run-image-export';
import { ExportImageDialog } from '../export-image-dialog';

const runImageExport = vi.hoisted(() => vi.fn());
vi.mock('../run-image-export', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    runImageExport,
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/platform/toast/use-toast', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    toast,
}));

beforeEach(() => {
    runImageExport.mockReset().mockResolvedValue(undefined);
    toast.mockReset();
});

type Format = 'png' | 'jpeg' | undefined;

/** The dialog with a button that switches its format, as the menu would. */
const Switcher: React.FC<{
    first: Format;
    target: HTMLElement;
    onClose: () => void;
}> = ({ first, target, onClose }) => {
    const [format, setFormat] = React.useState<Format>(first);
    return (
        <>
            <button onClick={() => setFormat('jpeg')}>switch to jpeg</button>
            <ExportImageDialog
                format={format}
                getTarget={() => target}
                onClose={onClose}
            />
        </>
    );
};

// `null` stands for "no format", which a default parameter would swallow
const show = (format: Format | null = 'png', onClose = vi.fn()) => {
    const target = document.createElement('div');
    const view = renderInEditor(
        <Switcher
            first={format ?? undefined}
            target={target}
            onClose={onClose}
        />,
        { design: withTables(['users']) }
    );
    return { ...view, onClose, target };
};

const exportButton = () => screen.getByRole('button', { name: 'Export' });
const advanced = () => screen.getByRole('button', { name: 'Advanced Options' });
const lastRequest = () =>
    runImageExport.mock.lastCall![0] as ImageExportRequest;

describe('ExportImageDialog', () => {
    it('is closed while there is no format', () => {
        show(null);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('names the format in its title', async () => {
        show('jpeg');
        expect(
            await screen.findByRole('dialog', { name: 'Export Image' })
        ).toBeInTheDocument();
    });

    it('opens and closes the advanced options', async () => {
        show();
        expect(advanced()).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('checkbox')).toBeNull();
        await userEvent.click(advanced());
        expect(advanced()).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getAllByRole('checkbox')).toHaveLength(2);
        await userEvent.click(advanced());
        expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('sends the options as they are ticked, with the target, design name and theme', async () => {
        const { target, onClose } = show();
        await userEvent.click(advanced());
        await userEvent.click(
            screen.getByRole('checkbox', { name: /background pattern/i })
        );
        await userEvent.click(
            screen.getByRole('checkbox', { name: /transparent/i })
        );
        await userEvent.click(exportButton());
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        const request = lastRequest();
        expect(request.format).toBe('png');
        expect(request.options).toEqual({
            scale: 4,
            pattern: false,
            transparent: true,
        });
        expect(request.getTarget()).toBe(target);
        expect(request.design.name).toBe(withTables(['users']).name);
        expect(['light', 'dark']).toContain(request.theme);
    });

    it('notes that a JPEG cannot be transparent, but only for JPEG', async () => {
        const note = /JPEG cannot be transparent/;
        const view = show('jpeg');
        await userEvent.click(advanced());
        expect(screen.queryByText(note)).toBeNull();
        await userEvent.click(
            screen.getByRole('checkbox', { name: /transparent/i })
        );
        expect(screen.getByText(note)).toBeInTheDocument();
        view.unmount();
        show('png');
        await userEvent.click(advanced());
        await userEvent.click(
            screen.getByRole('checkbox', { name: /transparent/i })
        );
        expect(screen.queryByText(note)).toBeNull();
    });

    it('starts from the defaults again when the format changes', async () => {
        show('png');
        await userEvent.click(advanced());
        await userEvent.click(
            screen.getByRole('checkbox', { name: /transparent/i })
        );
        // the switch sits behind the modal dialog, so it is clicked directly
        fireEvent.click(screen.getByText('switch to jpeg'));
        // the advanced part is folded again and transparency is off
        expect(advanced()).toHaveAttribute('aria-expanded', 'false');
        await userEvent.click(advanced());
        expect(
            screen.getByRole('checkbox', { name: /transparent/i })
        ).toHaveAttribute('aria-checked', 'false');
    });

    it('says there is nothing to draw for an empty diagram, and stays open to try again', async () => {
        runImageExport.mockRejectedValue(new CaptureError('empty'));
        const { onClose } = show();
        await userEvent.click(exportButton());
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({
                title: 'There is nothing to put in the picture yet',
                variant: 'destructive',
            })
        );
        expect(onClose).not.toHaveBeenCalled();
        expect(exportButton()).toBeEnabled();
    });

    it.each([
        ['a capture failure', new CaptureError('failed')],
        ['a missing canvas', new CaptureError('no-canvas')],
        ['any other error', new Error('boom')],
    ])('says the image could not be made after %s', async (_, error) => {
        runImageExport.mockRejectedValue(error);
        const { onClose } = show();
        await userEvent.click(exportButton());
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({
                title: 'The image could not be created',
                variant: 'destructive',
            })
        );
        expect(onClose).not.toHaveBeenCalled();
    });

    it('tells the person when the picture had to be made smaller, rounded down to two places', async () => {
        runImageExport.mockImplementation(async (r: ImageExportRequest) => {
            r.onLowered?.(1.2389);
        });
        show();
        await userEvent.click(exportButton());
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({
                title: 'The picture is very large, so it was made at 1.23x to fit the browser limit',
            })
        );
    });

    it('Cancel closes it', async () => {
        const { onClose } = show();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(runImageExport).not.toHaveBeenCalled();
    });

    it('Escape closes it while idle, but not while the image is being made', async () => {
        let finish!: () => void;
        runImageExport.mockReturnValue(
            new Promise<void>((resolve) => (finish = resolve))
        );
        const { onClose } = show();
        const dialog = await screen.findByRole('dialog');
        await userEvent.click(exportButton());
        expect(
            await screen.findByRole('button', { name: /Creating the image/ })
        ).toBeDisabled();
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
        // the options cannot be changed meanwhile
        expect(screen.getByRole('combobox', { name: 'Scale' })).toBeDisabled();
        await act(async () => finish());
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('Escape closes an idle dialog', async () => {
        const { onClose } = show();
        fireEvent.keyDown(await screen.findByRole('dialog'), {
            key: 'Escape',
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
