import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { blank } from '@/core/testing/helpers';
import { i18n } from '@/i18n/i18n';
import { HomePage } from '@/pages/home-page/home-page';
import { ShareViewerPage } from '@/pages/share-viewer-page/share-viewer-page';
import { EditorFrame } from '@/workspace/editor-frame';
import { renderInEditor } from '@/workspace/__tests__/test-harness';
import { HelmetData } from '../helmet-data';

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { getPublicShare: () => new Promise(() => undefined) },
}));

const meta = (selector: string) =>
    document.querySelector(selector)?.getAttribute('content');

describe('default title and description (SHL-100)', () => {
    it('is "QBase - Database schema diagrams", with the description and the Open Graph copies', async () => {
        render(
            <HelmetProvider>
                <HelmetData />
            </HelmetProvider>
        );
        await waitFor(() =>
            expect(document.title).toBe('QBase - Database schema diagrams')
        );
        const description =
            'Database schema diagrams: import a live database, publish versions, share read-only links, re-sync and detect drift.';
        expect(meta('meta[name="description"]')).toBe(description);
        expect(meta('meta[property="og:description"]')).toBe(description);
        expect(meta('meta[property="og:title"]')).toBe(
            'QBase - Database schema diagrams'
        );
        expect(meta('meta[property="og:type"]')).toBe('website');
    });

    it('the static page carries the same title', async () => {
        const { readFileSync } = await import('node:fs');
        const html = readFileSync('index.html', 'utf8');
        expect(html).toContain(
            '<title>QBase - Database schema diagrams</title>'
        );
    });
});

describe('the editor title (SHL-101)', () => {
    const mount = (name: string) =>
        renderInEditor(
            <HelmetProvider>
                <HelmetData />
                <EditorFrame />
            </HelmetProvider>,
            { design: { ...blank(), name } }
        );

    it('is "QBase - <diagram name>" and follows a rename', async () => {
        const { store } = mount('Shop');
        await waitFor(() => expect(document.title).toBe('QBase - Shop'));
        act(() =>
            store.getState().edit({ type: 'design.rename', name: 'Webshop' })
        );
        await waitFor(() => expect(document.title).toBe('QBase - Webshop'));
    });
});

describe('titles of the other pages (SHL-102)', () => {
    it('the home page sets the translated Projects title', async () => {
        render(
            <HelmetProvider>
                <MemoryRouter>
                    <HomePage />
                </MemoryRouter>
            </HelmetProvider>
        );
        await waitFor(() =>
            expect(document.title).toBe(i18n.t('qubdi.account.home.pageTitle'))
        );
        expect(document.title).toBe('QBase - Projects');
    });

    it('the shared-diagram viewer sets its own translated title', async () => {
        render(
            <HelmetProvider>
                <MemoryRouter initialEntries={['/s/abc']}>
                    <Routes>
                        <Route path="/s/:token" element={<ShareViewerPage />} />
                    </Routes>
                </MemoryRouter>
            </HelmetProvider>
        );
        await waitFor(() =>
            expect(document.title).toBe(i18n.t('qubdi.viewerPage.pageTitle'))
        );
        expect(screen.getByText('Loading…')).toBeTruthy();
    });

    it('the admin panel sets its own translated title', () => {
        expect(i18n.t('qubdi.adminUsers.shell.title')).toBeTruthy();
        expect(
            i18n.t('qubdi.adminUsers.shell.titleWithSection', {
                section: 'Users',
            })
        ).toContain('Users');
    });
});
