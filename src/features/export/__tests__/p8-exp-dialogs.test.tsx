import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderInEditor } from '@/workspace/__tests__/test-harness';
import { ExportImageDialog } from '../export-image-dialog';
import { ExportSqlDialog } from '../export-sql-dialog';

let release: () => void = () => undefined;
let request: { prepare?: () => void; options?: unknown } | undefined;
vi.mock('../run-image-export', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    runImageExport: (r: { prepare?: () => void; options?: unknown }) => {
        request = r;
        r.prepare?.();
        return new Promise<void>((resolve) => {
            release = resolve;
        });
    },
}));

describe('EXP-004 the SQL dialog', () => {
    it('shows a spinner first, then a read-only code box with a Copy button', async () => {
        renderInEditor(
            <ExportSqlDialog target="postgresql" onClose={() => undefined} />,
            { design: withTables(['users']) }
        );
        expect(screen.queryByRole('textbox')).toBeNull();
        const copy = screen.getByRole('button', {
            name: /Copy/,
        }) as HTMLButtonElement;
        expect(copy.disabled).toBe(true);
        const box = (await screen.findByRole('textbox', {
            name: 'Generated script',
        })) as HTMLTextAreaElement;
        expect(box.readOnly).toBe(true);
        expect(copy.disabled).toBe(false);
    });
});

describe('EXP-061 EXP-062 EXP-067 the image dialog', () => {
    it('starts at 4x with dots on and transparent off', async () => {
        renderInEditor(
            <ExportImageDialog
                format="png"
                getTarget={() => null}
                onClose={() => undefined}
            />,
            { design: withTables(['users']) }
        );
        expect(
            (await screen.findByRole('combobox', { name: 'Scale' })).textContent
        ).toBe('4x (Best Quality)');
        fireEvent.click(
            screen.getByRole('button', { name: 'Advanced Options' })
        );
        expect(
            screen
                .getByRole('checkbox', { name: /background pattern/i })
                .getAttribute('aria-checked')
        ).toBe('true');
        expect(
            screen
                .getByRole('checkbox', { name: /transparent/i })
                .getAttribute('aria-checked')
        ).toBe('false');
    });
    it('clears the selection, shows progress while exporting and closes when done', async () => {
        const onClose = vi.fn();
        const design = withTables(['users', 'orders']);
        const { store } = renderInEditor(
            <ExportImageDialog
                format="jpeg"
                getTarget={() => null}
                onClose={onClose}
            />,
            { design }
        );
        store.getState().select([design.entities.order[0]]);
        expect(store.getState().ui.selection.length).toBeGreaterThan(0);
        fireEvent.keyDown(
            await screen.findByRole('combobox', { name: 'Scale' }),
            { key: ' ' }
        );
        fireEvent.click(await screen.findByRole('option', { name: '2x' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export' }));
        await waitFor(() => expect(request).toBeTruthy());
        expect(store.getState().ui.selection).toEqual([]);
        expect(request?.options).toMatchObject({
            scale: 2,
            pattern: true,
            transparent: false,
        });
        const working = await screen.findByRole('button', {
            name: /Creating the image/,
        });
        expect((working as HTMLButtonElement).disabled).toBe(true);
        expect(
            (
                screen.getByRole('button', {
                    name: 'Cancel',
                }) as HTMLButtonElement
            ).disabled
        ).toBe(true);
        expect(onClose).not.toHaveBeenCalled();
        release();
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });
});
