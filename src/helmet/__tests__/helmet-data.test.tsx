import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { describe, expect, it } from 'vitest';
import { HelmetData } from '../helmet-data';

describe('HelmetData', () => {
    it('describes what the app does today, which no longer includes comments', async () => {
        render(
            <HelmetProvider>
                <HelmetData />
            </HelmetProvider>
        );
        await waitFor(() =>
            expect(
                document.querySelector('meta[name="description"]')
            ).not.toBeNull()
        );
        const text =
            document
                .querySelector('meta[name="description"]')
                ?.getAttribute('content') ?? '';
        expect(text).toMatch(/drift/i);
        expect(text).not.toMatch(/comment/i);
    });
});
