import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LastSaved } from '../last-saved';

const updatedAt = new Date(Date.now() - 5 * 60 * 1000);

vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { updatedAt } }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ i18n: { language: 'en' } }),
}));

describe('LastSaved', () => {
    it('says when the diagram was saved, as plain hover text', async () => {
        render(<LastSaved />);
        const icon = await screen.findByRole('img', {
            name: 'Saved 5 minutes ago',
        });
        expect(icon.getAttribute('title')).toBe(
            `Saved 5 minutes ago\n${updatedAt.toLocaleString()}`
        );
    });
});
