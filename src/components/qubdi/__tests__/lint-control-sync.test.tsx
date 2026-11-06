import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeConfig } from '../../../../shared/lint';
import { getLintConfig, setLintConfig } from '@/lib/qubdi/lint-config-store';
import { LintControl } from '../lint-control';

const getConfig = vi.fn();
const saveConfig = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        getLintConfig: (...a: unknown[]) => getConfig(...a),
        saveLintConfig: (...a: unknown[]) => saveConfig(...a),
    },
}));

vi.mock('@/hooks/use-focus-on', () => ({ useFocusOn: () => ({}) }));
vi.mock('@/hooks/use-layout', () => ({
    useLayout: () => ({ isSidePanelShowed: true, openTableFromSidebar: vi.fn() }),
}));
vi.mock('@/hooks/use-diagram', () => ({
    useDiagram: () => ({
        currentDiagram: { id: 'local-1', tables: [] },
        tables: [],
        databaseType: 'postgresql',
    }),
}));
const qubdi = { remoteIdFor: () => 'r1', user: { id: 'u1' } };
vi.mock('@/hooks/use-qubdi', () => ({ useQubdi: () => qubdi }));
const toast = vi.fn();
vi.mock('@/components/toast/use-toast', () => ({ useToast: () => ({ toast }) }));

// the settings form has its own tests: a stand-in that saves a known change
const changed = normalizeConfig({ rules: { 'orphan-table': { enabled: false } } });
vi.mock('../lint-settings-dialog', () => ({
    LintSettingsDialog: (p: { open: boolean; onSave: (c: unknown) => void }) =>
        p.open ? (
            <button onClick={() => p.onSave(changed)}>save-settings</button>
        ) : null,
}));

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

const openPanel = async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Lint/ }));
    await settle();
};

describe('LintControl and the server settings', () => {
    beforeEach(() => {
        localStorage.clear();
        getConfig.mockReset().mockResolvedValue(normalizeConfig(undefined));
        saveConfig.mockReset().mockResolvedValue(undefined);
        toast.mockReset();
        setLintConfig('local-1', normalizeConfig(undefined));
    });

    it('reads the settings from the server again each time the panel opens', async () => {
        render(<LintControl />);
        await settle();
        const before = getConfig.mock.calls.length;
        getConfig.mockResolvedValue(changed);
        await openPanel();
        expect(getConfig.mock.calls.length).toBe(before + 1);
        expect(getLintConfig('local-1')).toEqual(changed);
    });

    it('says so and puts the old settings back when the server refuses them', async () => {
        saveConfig.mockRejectedValue(new Error('down'));
        render(<LintControl />);
        await settle();
        const before = getLintConfig('local-1');
        await openPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Lint settings' }));
        await settle();
        fireEvent.click(screen.getByText('save-settings'));
        await settle();
        expect(saveConfig).toHaveBeenCalledWith('r1', changed);
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Lint settings were not saved to the server',
                variant: 'destructive',
            })
        );
        expect(getLintConfig('local-1')).toEqual(before);
    });

    it('keeps the new settings and stays quiet when the server accepts them', async () => {
        render(<LintControl />);
        await settle();
        await openPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Lint settings' }));
        await settle();
        fireEvent.click(screen.getByText('save-settings'));
        await settle();
        expect(toast).not.toHaveBeenCalled();
        expect(getLintConfig('local-1')).toEqual(changed);
    });
});
