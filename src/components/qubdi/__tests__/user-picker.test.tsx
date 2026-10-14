import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/lib/qubdi/api';
import { UserPicker } from '../user-picker';

const user = (id: string, email: string): AdminUser => ({
    id,
    email,
    isAdmin: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    projects: 0,
});

const everyone = [
    user('1', 'ann@corp.io'),
    user('2', 'bob@corp.io'),
    user('3', 'cara@other.io'),
];

const adminListUsers = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/qubdi/api')>()),
    api: { adminListUsers: (...args: unknown[]) => adminListUsers(...args) },
}));

const answer = (rows: AdminUser[], total = rows.length) => ({
    items: rows,
    total,
    page: 1,
    limit: 20,
});

describe('UserPicker', () => {
    beforeEach(() => {
        adminListUsers.mockReset();
        adminListUsers.mockImplementation(async (p: { q?: string }) =>
            answer(
                everyone.filter(
                    (u) => !p.q || u.email.includes(p.q.toLowerCase())
                )
            )
        );
    });

    it('lists users to choose from', async () => {
        render(
            <UserPicker
                selected={null}
                onSelect={vi.fn()}
                excludeIds={new Set()}
            />
        );
        expect(await screen.findByText('ann@corp.io')).toBeTruthy();
        expect(screen.getByText('cara@other.io')).toBeTruthy();
    });

    it('hides people who are already assigned', async () => {
        render(
            <UserPicker
                selected={null}
                onSelect={vi.fn()}
                excludeIds={new Set(['1', '3'])}
            />
        );
        expect(await screen.findByText('bob@corp.io')).toBeTruthy();
        expect(screen.queryByText('ann@corp.io')).toBeNull();
        expect(screen.queryByText('cara@other.io')).toBeNull();
    });

    it('searches the server as the admin types', async () => {
        render(
            <UserPicker
                selected={null}
                onSelect={vi.fn()}
                excludeIds={new Set()}
            />
        );
        await screen.findByText('ann@corp.io');
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'OTHER' },
        });
        await waitFor(
            () => expect(screen.queryByText('ann@corp.io')).toBeNull(),
            {
                timeout: 2000,
            }
        );
        expect(screen.getByText('cara@other.io')).toBeTruthy();
        expect(adminListUsers).toHaveBeenLastCalledWith(
            expect.objectContaining({ q: 'OTHER' })
        );
    });

    it('says so when nobody matches', async () => {
        render(
            <UserPicker
                selected={null}
                onSelect={vi.fn()}
                excludeIds={new Set()}
            />
        );
        await screen.findByText('ann@corp.io');
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'zzz' },
        });
        expect(
            await screen.findByText(/No matching user/, undefined, {
                timeout: 2000,
            })
        ).toBeTruthy();
    });

    it('hints to narrow the search when more users exist than are shown', async () => {
        adminListUsers.mockResolvedValue(
            answer([user('1', 'ann@corp.io')], 80)
        );
        render(
            <UserPicker
                selected={null}
                onSelect={vi.fn()}
                excludeIds={new Set(['1'])}
            />
        );
        expect(await screen.findByText(/Type more to narrow/)).toBeTruthy();
    });

    it('reports the chosen user', async () => {
        const onSelect = vi.fn();
        render(
            <UserPicker
                selected={null}
                onSelect={onSelect}
                excludeIds={new Set()}
            />
        );
        fireEvent.click(await screen.findByText('bob@corp.io'));
        expect(onSelect).toHaveBeenCalledWith(everyone[1]);
    });

    it('shows the chosen user and lets the admin change it', () => {
        const onSelect = vi.fn();
        render(
            <UserPicker
                selected={everyone[0]}
                onSelect={onSelect}
                excludeIds={new Set()}
            />
        );
        expect(screen.getByText('ann@corp.io')).toBeTruthy();
        expect(screen.queryByRole('searchbox')).toBeNull();
        fireEvent.click(screen.getByLabelText('Choose a different user'));
        expect(onSelect).toHaveBeenCalledWith(null);
    });
});
