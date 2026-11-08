import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceContext } from '@/components/qubdi/workspace-context';
import type { MyProject } from '@/lib/qubdi/api';
import { useDialog } from '@/hooks/use-dialog';
import { blank, withTables } from '@/core/testing/helpers';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { StartFlow } from '../start-flow';
import {
    captureDiagram,
    CaptureError,
    measureNodes,
} from '@/features/export/capture-image';
import { runImageExport } from '@/features/export/run-image-export';
import { renderInEditor } from './test-harness';

const Openers: React.FC = () => {
    const d = useDialog();
    return (
        <>
            <button onClick={() => d.openCreateDiagramDialog()}>make</button>
            <button
                onClick={() => d.openOpenDiagramDialog({ canClose: false })}
            >
                browse
            </button>
            <button onClick={() => d.openSettingsDialog()}>prefs</button>
        </>
    );
};

describe('dialog provider (spec B2, P9)', () => {
    it('opens the local dialogs outside a project', async () => {
        renderInEditor(<Openers />, { design: blank() });
        fireEvent.click(screen.getByText('make'));
        expect(await screen.findByText('What is your Database?')).toBeTruthy();
    });

    it('opens the QBase project dialogs inside a project workspace', async () => {
        const project = {
            id: 'p1',
            name: 'Billing',
            slug: 'billing',
            role: 'owner',
        } as MyProject;
        renderInEditor(
            <Openers />,
            { design: blank() },
            '/diagrams/x',
            new MemoryStorageAdapter(),
            (node) => (
                <WorkspaceContext.Provider
                    value={{
                        project,
                        localDiagramId: undefined,
                        remoteDiagramId: undefined,
                    }}
                >
                    {node}
                </WorkspaceContext.Provider>
            )
        );
        fireEvent.click(screen.getByText('make'));
        // the project form asks for a name, not a database card
        expect(
            await screen.findByRole('button', { name: /create/i })
        ).toBeTruthy();
        expect(screen.queryByText('What is your Database?')).toBeNull();
    });

    it('the open dialog takes a can-close flag', async () => {
        renderInEditor(<Openers />, { design: blank() });
        fireEvent.click(screen.getByText('browse'));
        await screen.findByText('Open Database');
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });

    it('opens the preferences', async () => {
        renderInEditor(<Openers />, { design: blank() });
        fireEvent.click(screen.getByText('prefs'));
        expect(await screen.findByText('Keyboard shortcuts')).toBeTruthy();
    });
});

describe('start flow (spec A3)', () => {
    it('with nothing stored it asks for a new diagram and cannot be dismissed', async () => {
        renderInEditor(<StartFlow />, null, '/');
        expect(await screen.findByText('What is your Database?')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    });

    it('with diagrams stored it asks which to open', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save(withTables(['a']));
        renderInEditor(<StartFlow />, null, '/', adapter);
        expect(await screen.findByText('Open Database')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });
});

describe('image capture (EXP-060 to EXP-067)', () => {
    const surface = (
        nodes: { x: number; y: number; w: number; h: number }[],
        zoom = 1
    ) => {
        const root = document.createElement('div');
        root.innerHTML = '<div class="react-flow__viewport"></div>';
        const viewport = root.querySelector(
            '.react-flow__viewport'
        ) as HTMLElement;
        viewport.style.transform = `translate(40px, 30px) scale(${zoom})`;
        viewport.getBoundingClientRect = () => ({
            left: 40,
            top: 30,
            right: 40,
            bottom: 30,
            width: 0,
            height: 0,
            x: 40,
            y: 30,
            toJSON: () => ({}),
        });
        for (const n of nodes) {
            const el = document.createElement('div');
            el.className = 'react-flow__node';
            el.getBoundingClientRect = () => ({
                left: 40 + n.x * zoom,
                top: 30 + n.y * zoom,
                right: 40 + (n.x + n.w) * zoom,
                bottom: 30 + (n.y + n.h) * zoom,
                width: n.w * zoom,
                height: n.h * zoom,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            });
            root.appendChild(el);
        }
        return root;
    };

    it('measures nodes in diagram space whatever the zoom', () => {
        const root = surface([{ x: 10, y: 20, w: 200, h: 100 }], 0.5);
        const [box] = measureNodes(root);
        expect(box.x).toBeCloseTo(10);
        expect(box.y).toBeCloseTo(20);
        expect(box.width).toBeCloseTo(200);
        expect(box.height).toBeCloseTo(100);
    });

    it('refuses a missing surface and an empty diagram', async () => {
        const options = {
            format: 'png' as const,
            scale: 1 as const,
            pattern: true,
            transparent: false,
            theme: 'light' as const,
        };
        await expect(captureDiagram(null, options)).rejects.toMatchObject({
            reason: 'no-canvas',
        });
        await expect(
            captureDiagram(surface([]), options)
        ).rejects.toMatchObject({ reason: 'empty' });
        expect(new CaptureError('empty').reason).toBe('empty');
    });

    it('clears the selection first and reports what could not be captured', async () => {
        const prepare = vi.fn();
        await expect(
            runImageExport({
                format: 'svg',
                design: { name: 'Shop' },
                theme: 'dark',
                getTarget: () => null,
                prepare,
            })
        ).rejects.toMatchObject({ reason: 'no-canvas' });
        expect(prepare).toHaveBeenCalledTimes(1);
    });
});

describe('page wrapper', () => {
    it('is exported for the router', async () => {
        const mod = await import('../editor-page');
        expect(mod.EditorPage).toBeTypeOf('function');
        expect(render).toBeTypeOf('function');
        await waitFor(() => undefined);
    });
});
