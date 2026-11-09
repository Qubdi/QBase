import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from '../search-input';

describe('SearchInput', () => {
    it('reports what is typed', () => {
        const onChange = vi.fn();
        render(
            <SearchInput
                value=""
                onChange={onChange}
                placeholder="Find users"
            />
        );
        fireEvent.change(
            screen.getByRole('searchbox', { name: 'Find users' }),
            {
                target: { value: 'ann' },
            }
        );
        expect(onChange).toHaveBeenCalledWith('ann');
    });

    it('offers to clear only when there is text, and clears it', () => {
        const onChange = vi.fn();
        const view = render(
            <SearchInput
                value=""
                onChange={onChange}
                placeholder="Find users"
            />
        );
        expect(
            screen.queryByRole('button', { name: 'Clear search' })
        ).toBeNull();
        view.rerender(
            <SearchInput
                value="ann"
                onChange={onChange}
                placeholder="Find users"
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(onChange).toHaveBeenCalledWith('');
    });

    it('is named by its label when one is given, else by its placeholder', () => {
        render(
            <SearchInput
                value=""
                onChange={() => undefined}
                placeholder="Find"
                label="Find a project"
            />
        );
        expect(
            screen.getByRole('searchbox', { name: 'Find a project' })
        ).toBeTruthy();
    });
});
