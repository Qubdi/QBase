import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from '../spinner';

describe('Spinner', () => {
    it('is announced as a status and spins', () => {
        render(<Spinner />);
        expect(
            screen.getByRole('status').classList.contains('animate-spin')
        ).toBe(true);
    });

    it('sizes by the size prop and keeps extra classes', () => {
        render(<Spinner size="large" className="m-auto" />);
        const el = screen.getByRole('status');
        expect(el.classList.contains('size-8')).toBe(true);
        expect(el.classList.contains('m-auto')).toBe(true);
    });
});
