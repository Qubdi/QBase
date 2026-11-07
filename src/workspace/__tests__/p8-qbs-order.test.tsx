import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { __h: unknown }).__h = (
    name: string,
    children: unknown
) => <div data-marker={name}>{children as React.ReactNode}</div>;

// every wrapper is replaced by a marker element, so the nesting is what is tested
const { marker } = vi.hoisted(() => ({
    marker: (name: string) => {
        const Marker = ({ children }: { children?: unknown }) =>
            (
                globalThis as unknown as {
                    __h: (n: string, c: unknown) => unknown;
                }
            ).__h(name, children);
        return Marker;
    },
}));

vi.mock('@/components/qubdi/diagram-access', () => ({
    DiagramAccessGate: ({
        children,
    }: React.PropsWithChildren<{ fallback?: React.ReactNode }>) => (
        <div data-marker="gate">{children}</div>
    ),
}));
vi.mock('@/context/local-config-context/local-config-provider', () => ({
    LocalConfigProvider: marker('config'),
}));
vi.mock('@/platform/theme/theme-provider', () => ({
    ThemeProvider: marker('theme'),
}));
vi.mock('@/qbase/storage-provider', () => ({
    StorageProvider: marker('storage'),
}));
vi.mock('@/context/dialog-context/dialog-provider', () => ({
    DialogProvider: marker('dialogs'),
}));
vi.mock('../canvas-bridge', () => ({ CanvasBridgeProvider: marker('bridge') }));
vi.mock('../editor-frame', () => ({
    EditorFrame: () => <div data-marker="frame" />,
}));
vi.mock('../start-flow', () => ({
    StartFlow: () => <div data-marker="start" />,
}));

import { EditorPage } from '../editor-page';

describe('QBS-022 / QBS-024 the editor page provider order', () => {
    it('local config, theme, storage, then the access gate, then the editor providers and frame', () => {
        const { container } = render(<EditorPage />);
        const chain: string[] = [];
        let node = container.querySelector('[data-marker="frame"]')
            ?.parentElement as HTMLElement | null;
        chain.unshift('frame');
        while (node && node !== container) {
            const name = node.getAttribute('data-marker');
            if (name) chain.unshift(name);
            node = node.parentElement;
        }
        const at = (n: string) => chain.indexOf(n);
        expect(at('config')).toBeLessThan(at('theme'));
        expect(at('theme')).toBeLessThan(at('storage'));
        // the gate wraps the diagram provider and sits inside storage
        expect(at('storage')).toBeLessThan(at('gate'));
        expect(at('gate')).toBeLessThan(at('dialogs'));
        expect(at('dialogs')).toBeLessThan(at('frame'));
    });
});
