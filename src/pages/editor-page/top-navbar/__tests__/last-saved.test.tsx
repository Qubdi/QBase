import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LastSaved } from '../last-saved';
import { wordsFunction } from '../words-function';

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

    it('takes the words function out of a bundled module object too (German crashed the built app)', () => {
        const words = () => ['a', 'b'];
        expect(wordsFunction(words)).toBe(words);
        expect(wordsFunction({ default: words })).toBe(words);
        expect(wordsFunction({ default: { default: words } })).toBe(words);
    });
});
