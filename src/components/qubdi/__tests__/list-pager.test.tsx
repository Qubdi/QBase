import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListPager } from '../list-pager';

const show = (props: Partial<React.ComponentProps<typeof ListPager>> = {}) => {
    const onPageChange = vi.fn();
    render(
        <ListPager
            page={2}
            pageCount={5}
            limit={10}
            total={43}
            onPageChange={onPageChange}
            noun="users"
            {...props}
        />
    );
    return onPageChange;
};

describe('ListPager', () => {
    it('says which rows are shown and which page this is', () => {
        show();
        expect(screen.getByText('11–20 of 43 users')).toBeTruthy();
        expect(screen.getByText('2 / 5')).toBeTruthy();
    });

    it('goes to the previous and the next page', () => {
        const onPageChange = show();
        fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        expect(onPageChange.mock.calls).toEqual([[1], [3]]);
    });

    it('holds Previous on the first page and Next on the last', () => {
        show({ page: 1 });
        expect(
            (
                screen.getByRole('button', {
                    name: 'Previous page',
                }) as HTMLButtonElement
            ).disabled
        ).toBe(true);
        expect(
            (
                screen.getByRole('button', {
                    name: 'Next page',
                }) as HTMLButtonElement
            ).disabled
        ).toBe(false);
    });

    it('holds Next on the last page', () => {
        show({ page: 5 });
        expect(
            (
                screen.getByRole('button', {
                    name: 'Next page',
                }) as HTMLButtonElement
            ).disabled
        ).toBe(true);
    });

    it('holds both buttons while disabled', () => {
        show({ disabled: true });
        for (const name of ['Previous page', 'Next page'])
            expect(
                (screen.getByRole('button', { name }) as HTMLButtonElement)
                    .disabled
            ).toBe(true);
    });

    it('says there is nothing when the list is empty, with a default noun', () => {
        show({ total: 0, noun: undefined, page: 1, pageCount: 1 });
        expect(screen.getByText('No items')).toBeTruthy();
    });
});
