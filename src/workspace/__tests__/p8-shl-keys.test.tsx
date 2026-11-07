import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FIT_MAX_ZOOM, FIT_PADDING } from '@/canvas/geometry';
import { FIT_MS } from '@/canvas/use-viewport';
import { qubdiContext } from '@/context/qubdi-context/qubdi-context';
import type { QubdiContext } from '@/context/qubdi-context/qubdi-context';
import { blank } from '@/core/testing/helpers';
import { Toaster } from '@/platform/toast/toaster';
import { resetToasts } from '@/platform/toast/use-toast';
import { useWorkspaceCommands } from '../use-workspace-commands';
import type { WorkspaceCommands } from '../use-workspace-commands';
import { useWorkspaceShortcuts } from '../use-workspace-shortcuts';
import { renderInEditor } from './test-harness';

const Listen: React.FC<{ commands: WorkspaceCommands }> = ({ commands }) => {
    useWorkspaceShortcuts(commands);
    return null;
};

const press = (init: KeyboardEventInit, target: Element = document.body) => {
    const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
    });
    target.dispatchEvent(event);
    return event;
};

describe('the shell shortcuts (SHL-065)', () => {
    const commands = {
        undo: vi.fn(),
        redo: vi.fn(),
        openDiagram: vi.fn(),
        save: vi.fn(),
        togglePanel: vi.fn(),
        toggleTheme: vi.fn(),
        toggleFilter: vi.fn(),
    };

    it('each key runs its command and cancels the browser action', () => {
        render(<Listen commands={commands} />);
        const cases: [KeyboardEventInit, keyof typeof commands][] = [
            [{ key: 'z', ctrlKey: true }, 'undo'],
            [{ key: 'z', ctrlKey: true, shiftKey: true }, 'redo'],
            [{ key: 'o', ctrlKey: true }, 'openDiagram'],
            [{ key: 's', ctrlKey: true }, 'save'],
            [{ key: 'b', ctrlKey: true }, 'togglePanel'],
            [{ key: 'm', ctrlKey: true }, 'toggleTheme'],
            [{ key: 'f', ctrlKey: true }, 'toggleFilter'],
        ];
        for (const [init, id] of cases) {
            const event = press(init);
            expect(commands[id], id).toHaveBeenCalledTimes(1);
            expect(event.defaultPrevented, id).toBe(true);
        }
        // Shift made it a redo, not an undo
        expect(commands.undo).toHaveBeenCalledTimes(1);
    });

    it('without Ctrl or Cmd nothing happens and the browser is left alone', () => {
        const run = { undo: vi.fn() };
        render(<Listen commands={run} />);
        const event = press({ key: 'z' });
        expect(run.undo).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });
});

describe('fit all (SHL-066)', () => {
    it('animates for half a second, pads 10% and zooms in to 0.8 at most', () => {
        expect(FIT_MS).toBe(500);
        expect(FIT_PADDING).toBe(0.1);
        expect(FIT_MAX_ZOOM).toBe(0.8);
    });

    it('the theme key works inside a text box', () => {
        const toggleTheme = vi.fn();
        const { container } = render(
            <>
                <Listen commands={{ toggleTheme }} />
                <input />
            </>
        );
        press({ key: 'm', ctrlKey: true }, container.querySelector('input')!);
        expect(toggleTheme).toHaveBeenCalledTimes(1);
    });
});

describe('Open key with a server (SHL-067)', () => {
    const Where: React.FC = () => (
        <div data-testid="where">{useLocation().pathname}</div>
    );
    const Keys: React.FC = () => {
        const commands = useWorkspaceCommands();
        useWorkspaceShortcuts(commands);
        return null;
    };

    it('goes to / instead of opening the Open dialog', async () => {
        const view = renderInEditor(
            <qubdiContext.Provider
                value={{ enabled: true } as unknown as QubdiContext}
            >
                <Keys />
                <Where />
            </qubdiContext.Provider>,
            { design: blank() },
            '/billing/diagrams/r1'
        );
        act(() => void press({ key: 'o', ctrlKey: true }));
        await waitFor(() =>
            expect(view.getByTestId('where').textContent).toBe('/')
        );
    });

    it('opens the Open dialog without a server', async () => {
        const view = renderInEditor(
            <>
                <Keys />
                <Where />
            </>,
            { design: blank() },
            '/diagrams/x'
        );
        fireEvent.keyDown(document.body, { key: 'o', ctrlKey: true });
        expect(await view.findByText('Your diagrams')).toBeTruthy();
        expect(view.getByTestId('where').textContent).toBe('/diagrams/x');
    });
});

describe('theme key (SHL-086)', () => {
    const Keys: React.FC = () => {
        const commands = useWorkspaceCommands();
        useWorkspaceShortcuts(commands);
        return null;
    };
    const dark = (matches: boolean) =>
        vi.stubGlobal('matchMedia', () => ({
            matches,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }));

    it('with System on a dark system it goes to Light; on a light system to Dark', () => {
        localStorage.clear();
        dark(true);
        const first = renderInEditor(<Keys />, { design: blank() });
        act(() => void press({ key: 'm', ctrlKey: true }));
        expect(localStorage.getItem('theme')).toBe('light');
        first.unmount();
        localStorage.clear();
        dark(false);
        renderInEditor(<Keys />, { design: blank() });
        act(() => void press({ key: 'm', ctrlKey: true }));
        expect(localStorage.getItem('theme')).toBe('dark');
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('with a chosen theme it goes to the other one', () => {
        localStorage.clear();
        localStorage.setItem('theme', 'dark');
        renderInEditor(<Keys />, { design: blank() });
        act(() => void press({ key: 'm', ctrlKey: true }));
        expect(localStorage.getItem('theme')).toBe('light');
        act(() => void press({ key: 'm', ctrlKey: true }));
        expect(localStorage.getItem('theme')).toBe('dark');
        localStorage.clear();
    });
});

describe('save key (SHL-031)', () => {
    const Keys: React.FC = () => {
        const commands = useWorkspaceCommands();
        useWorkspaceShortcuts(commands);
        return null;
    };

    it('confirms with a toast and leaves the diagram and its modified time alone', async () => {
        const design = blank();
        const { store, findByText } = renderInEditor(
            <>
                <Keys />
                <Toaster />
            </>,
            { design }
        );
        const event = new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        act(() => void document.body.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(true);
        expect(await findByText('Everything is saved')).toBeTruthy();
        expect(store.getState().design).toBe(design);
        expect(store.getState().design.updatedAt).toBe(design.updatedAt);
        resetToasts();
    });

    it('says it is still saving while there are unsaved changes', async () => {
        const { store, findByText } = renderInEditor(
            <>
                <Keys />
                <Toaster />
            </>,
            { design: blank() }
        );
        act(() =>
            store.getState().edit({ type: 'design.rename', name: 'Edited' })
        );
        act(() => void press({ key: 's', ctrlKey: true }));
        expect(await findByText('Saving your latest changes')).toBeTruthy();
        resetToasts();
    });
});
