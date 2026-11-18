import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessState } from '@/lib/qubdi/access';
import { ApiError } from '@/lib/qubdi/api';
import { DiagramAccessContext } from '../diagram-access-context';
import { LockChannelContext, type IncomingPoke } from '../lock-channel-context';
import { PokeRequestDialog } from '../poke-request-dialog';

const calls: string[] = [];
const answerPoke = vi.fn();
const flush = vi.fn();
const unsaved = vi.fn();
const lost = vi.fn();
const toast = vi.fn();
const dismiss = vi.fn();

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { answerPoke: (...a: unknown[]) => answerPoke(...a) },
}));
vi.mock('@/lib/qubdi/editor-id', () => ({ getEditorId: () => 'tab-1' }));
vi.mock('@/lib/qubdi/save-status-store', () => ({
    flushPendingSave: () => flush(),
    hasUnsavedChanges: () => unsaved(),
}));
vi.mock('@/lib/qubdi/lock-lost', () => ({
    reportLockLost: (...a: unknown[]) => lost(...a),
}));
vi.mock('@/platform/toast/use-toast', () => ({
    useToast: () => ({ toast }),
}));

const request: IncomingPoke = { pokeId: 'p1', from: 'sam@corp.io' };
const holding: AccessState = {
    status: 'editor',
    projectId: 'p',
    remoteId: 'r1',
};

const show = (
    incoming: IncomingPoke | null = request,
    access: AccessState = holding
) =>
    render(
        <DiagramAccessContext.Provider value={{ access, refresh: vi.fn() }}>
            <LockChannelContext.Provider
                value={{ incoming, result: null, dismiss }}
            >
                <PokeRequestDialog />
            </LockChannelContext.Provider>
        </DiagramAccessContext.Provider>
    );

const button = (name: string) =>
    screen.getByRole('button', { name }) as HTMLButtonElement;
const press = (name: string) =>
    act(async () => {
        fireEvent.click(button(name));
    });

describe('PokeRequestDialog', () => {
    beforeEach(() => {
        calls.length = 0;
        answerPoke.mockReset().mockImplementation(async () => {
            calls.push('answer');
        });
        flush.mockReset().mockImplementation(async () => {
            calls.push('flush');
        });
        unsaved.mockReset().mockReturnValue(false);
        lost.mockReset().mockImplementation(() => calls.push('read-only'));
        toast.mockReset();
        dismiss.mockReset().mockImplementation(() => calls.push('dismiss'));
    });

    it('stays out of the way until somebody asks', () => {
        show(null);
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('says who wants to edit, and what each answer means', () => {
        show();
        expect(screen.getByRole('alertdialog')).toBeTruthy();
        expect(
            screen.getByText('sam@corp.io wants to edit this diagram')
        ).toBeTruthy();
        const text = screen.getByRole('alertdialog').textContent;
        expect(text).toContain('your latest changes are saved first');
        expect(text).toContain('read-only for you');
        expect(text).toContain('you can keep working');
        expect(button('Decline')).toBeTruthy();
        expect(button('Agree and step out')).toBeTruthy();
    });

    it.each<[string, AccessState]>([
        [
            'does not hold the lock',
            { status: 'taken', projectId: 'p', remoteId: 'r1', holder: 'x' },
        ],
        ['may only view', { status: 'viewer', projectId: 'p', remoteId: 'r1' }],
        ['has not been checked yet', { status: 'loading' }],
    ])('is not for an editor that %s', (_why, access) => {
        show(request, access);
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('has to be answered: Escape and a click outside do nothing', () => {
        show();
        fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
        const overlay = document.querySelector('[data-state="open"].fixed');
        if (overlay) fireEvent.click(overlay);
        expect(screen.getByRole('alertdialog')).toBeTruthy();
        expect(answerPoke).not.toHaveBeenCalled();
        expect(dismiss).not.toHaveBeenCalled();
    });

    describe('declining', () => {
        it('tells the server and carries on, saving nothing and giving nothing up', async () => {
            show();
            await press('Decline');
            expect(answerPoke).toHaveBeenCalledExactlyOnceWith(
                'r1',
                'p1',
                'tab-1',
                false
            );
            expect(flush).not.toHaveBeenCalled();
            expect(lost).not.toHaveBeenCalled();
            expect(dismiss).toHaveBeenCalledExactlyOnceWith('p1');
        });
    });

    describe('agreeing', () => {
        it('saves first, then hands the diagram over, then turns read-only', async () => {
            show();
            await press('Agree and step out');
            expect(calls).toEqual(['flush', 'answer', 'dismiss', 'read-only']);
            expect(answerPoke).toHaveBeenCalledExactlyOnceWith(
                'r1',
                'p1',
                'tab-1',
                true
            );
            // the editor learns who has the diagram now
            expect(lost).toHaveBeenCalledExactlyOnceWith('r1', 'sam@corp.io');
        });

        it('shows that it is saving, and cannot be answered twice meanwhile', async () => {
            let finish!: () => void;
            flush.mockReturnValue(new Promise<void>((r) => (finish = r)));
            show();
            await press('Agree and step out');
            expect(button('Saving…').disabled).toBe(true);
            expect(button('Decline').disabled).toBe(true);
            fireEvent.click(button('Saving…'));
            fireEvent.click(button('Decline'));
            await act(async () => finish());
            expect(answerPoke).toHaveBeenCalledTimes(1);
            expect(answerPoke.mock.calls[0][3]).toBe(true);
        });

        it('keeps the editor where it is when its last changes could not be saved', async () => {
            unsaved.mockReturnValue(true);
            show();
            await press('Agree and step out');
            expect(answerPoke).not.toHaveBeenCalled();
            expect(lost).not.toHaveBeenCalled();
            expect(dismiss).not.toHaveBeenCalled();
            expect(toast).toHaveBeenCalledWith({
                title: 'Your changes could not be saved',
                description:
                    'You are still the editor of this diagram. Try again, or decline the request.',
                variant: 'destructive',
            });
            // still asking, and answerable again
            expect(screen.getByRole('alertdialog')).toBeTruthy();
            expect(button('Agree and step out').disabled).toBe(false);
            expect(button('Decline').disabled).toBe(false);
        });

        it('stays the editor when the server did not take the answer', async () => {
            answerPoke.mockRejectedValue(new TypeError('Failed to fetch'));
            show();
            await press('Agree and step out');
            expect(lost).not.toHaveBeenCalled();
            expect(toast).toHaveBeenCalledWith({
                title: 'Could not answer the request',
                description: 'Could not reach the server.',
                variant: 'destructive',
            });
            // a dropped connection may pass: the request is still there to answer
            expect(dismiss).not.toHaveBeenCalled();
            expect(button('Agree and step out').disabled).toBe(false);
        });
    });

    describe('a request that is already over', () => {
        it.each([
            [410, 'poke_expired', 'This request has run out of time.'],
            [409, 'poke_answered', 'This request was already answered.'],
            [
                409,
                'lock_changed',
                'This diagram is no longer being edited from this page.',
            ],
            [404, 'not_found', 'Not found.'],
        ])(
            'is explained and put away (%s %s), keeping the diagram',
            async (status, code, text) => {
                answerPoke.mockRejectedValue(new ApiError(status, code));
                show();
                await press('Agree and step out');
                expect(toast).toHaveBeenCalledWith({
                    title: 'Could not answer the request',
                    description: text,
                    variant: 'destructive',
                });
                expect(dismiss).toHaveBeenCalledExactlyOnceWith('p1');
                expect(lost).not.toHaveBeenCalled();
            }
        );
    });
});
