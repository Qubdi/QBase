import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyProject } from '@/lib/qubdi/api';
import { ApiError } from '@/lib/qubdi/api';
import { DiagramAccessContext } from '../diagram-access-context';
import { LockChannelContext, type PokeResult } from '../lock-channel-context';
import { TakenBanner, type TakenBannerProps } from '../taken-banner';
import { POKE_COOLDOWN_MS } from '../use-poke';
import { WorkspaceContext, type Workspace } from '../workspace-context';

const pokeLock = vi.fn();
const getLatest = vi.fn();
const toast = vi.fn();
const deleteDiagram = vi.fn();

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { pokeLock: (...a: unknown[]) => pokeLock(...a) },
}));
vi.mock('@/lib/qubdi/editor-id', () => ({ getEditorId: () => 'tab-1' }));
vi.mock('@/lib/qubdi/get-latest', () => ({
    getLatestFromServer: (...a: unknown[]) => getLatest(...a),
}));
vi.mock('@/qbase/use-storage', () => ({
    useStorage: () => ({ deleteDiagram }),
}));
vi.mock('@/platform/toast/use-toast', () => ({
    useToast: () => ({ toast }),
}));

const REASON =
    'sam@corp.io is editing this diagram, so it is read-only for you for now.';
const workspace: Workspace = {
    project: { slug: 'billing' } as MyProject,
    localDiagramId: 'local-1',
    remoteDiagramId: 'r1',
};
const sent = {
    status: 'sent',
    pokeId: 'p1',
    waitSeconds: 60,
    holder: 'sam@corp.io',
};

interface Setup extends Partial<TakenBannerProps> {
    result?: PokeResult | null;
    workspace?: Workspace | null;
}

const refresh = vi.fn();
const view = ({
    result = null,
    workspace: ws = workspace,
    ...props
}: Setup) => (
    <WorkspaceContext.Provider value={ws}>
        <DiagramAccessContext.Provider
            value={{
                access: {
                    status: 'taken',
                    projectId: 'p',
                    remoteId: 'r1',
                    holder: 'sam@corp.io',
                },
                refresh,
            }}
        >
            <LockChannelContext.Provider
                value={{ incoming: null, result, dismiss: () => undefined }}
            >
                <TakenBanner
                    remoteId="r1"
                    reason={REASON}
                    holder="sam@corp.io"
                    ownTab={false}
                    {...props}
                />
            </LockChannelContext.Provider>
        </DiagramAccessContext.Provider>
    </WorkspaceContext.Provider>
);

/** renders, and gives back a way to change what the lock stream has said */
const show = (setup: Setup = {}) => {
    const utils = render(view(setup));
    return {
        ...utils,
        stream: (result: PokeResult | null) =>
            utils.rerender(view({ ...setup, result })),
        /** draws again with some of what the banner depends on replaced */
        redraw: (more: Setup) => utils.rerender(view({ ...setup, ...more })),
    };
};

const pokeButton = () =>
    screen.getByRole('button', {
        name: /^(Poke|Poking|Waiting|Loading)/,
    }) as HTMLButtonElement;
const note = () => screen.getByRole('status').textContent ?? '';
const click = async () => {
    await act(async () => {
        fireEvent.click(pokeButton());
    });
};
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('TakenBanner', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        pokeLock.mockReset().mockResolvedValue(sent);
        getLatest.mockReset().mockResolvedValue(undefined);
        toast.mockReset();
        refresh.mockReset();
    });
    afterEach(() => vi.useRealTimers());

    describe('what it says', () => {
        it('says who is editing and that they have to leave before you can go on', () => {
            show();
            expect(note()).toContain(REASON);
            expect(note()).toContain(
                'They need to leave the diagram before you can continue working.'
            );
        });

        it('is a compact tinted strip, not a heavy block', () => {
            show();
            const banner = screen.getByRole('status');
            expect(banner.className).toContain('bg-amber-50');
            // the thin line the other banners have, and a modest height
            expect(banner.className).toMatch(/\bborder-b\b/);
            expect(banner.className).not.toContain('border-b-2');
            expect(banner.className).toContain('py-2.5');
            // one run of text, the reason in a heavier weight
            expect(banner.querySelectorAll('p')).toHaveLength(1);
            expect(screen.getByText(REASON).className).toContain('font-medium');
            expect(screen.getByText(REASON).className).not.toContain(
                'text-base'
            );
        });

        it('offers to poke and nothing else: taking the diagram loads the latest version by itself', () => {
            show();
            expect(pokeButton().textContent).toBe('Poke');
            expect(pokeButton().disabled).toBe(false);
            expect(pokeButton().title).toBe(
                'Ask sam@corp.io to step out of this diagram'
            );
            expect(screen.getAllByRole('button')).toHaveLength(1);
        });

        it("has nobody to poke when the editor is the user's own other tab", () => {
            show({ ownTab: true });
            expect(screen.queryByRole('button', { name: /Poke/ })).toBeNull();
            expect(note()).toContain(
                'Close the other tab or window to continue working here.'
            );
            expect(note()).not.toContain('They need to leave');
        });
    });

    describe('poking', () => {
        it('asks for this editor, and counts down while it waits for the answer', async () => {
            show();
            await click();
            expect(pokeLock).toHaveBeenCalledExactlyOnceWith('r1', 'tab-1');
            expect(note()).toContain(
                'Request sent. Waiting for sam@corp.io to answer… (60 s)'
            );
            expect(pokeButton().textContent).toBe('Waiting for an answer…');
            expect(pokeButton().disabled).toBe(true);

            await advance(1000);
            expect(note()).toContain('(59 s)');
            await advance(9000);
            expect(note()).toContain('(50 s)');
        });

        it('sends one request however often it is clicked', async () => {
            let resolve!: (v: unknown) => void;
            pokeLock.mockReturnValue(new Promise((r) => (resolve = r)));
            show();
            await click();
            expect(pokeButton().textContent).toBe('Poking…');
            expect(pokeButton().disabled).toBe(true);
            fireEvent.click(pokeButton());
            fireEvent.click(pokeButton());
            await act(async () => resolve(sent));
            fireEvent.click(pokeButton());
            expect(pokeLock).toHaveBeenCalledTimes(1);
        });

        it('says so when the holder does not answer in time', async () => {
            show();
            await click();
            await advance(59_000);
            expect(note()).toContain('Waiting for sam@corp.io');
            await advance(1000);
            expect(note()).toContain(
                'sam@corp.io did not answer. Please try again.'
            );
            expect(getLatest).not.toHaveBeenCalled();
        });

        it('speaks of "someone else" when nobody was named', async () => {
            show({ holder: null });
            await click();
            await advance(60_000);
            expect(note()).toContain(
                'Someone else did not answer. Please try again.'
            );
        });
    });

    describe('the holder declines', () => {
        it('tells the one who asked, and keeps them where they are', async () => {
            const { stream } = show();
            await click();
            stream({ pokeId: 'p1', outcome: 'declined' });
            expect(note()).toContain(
                'Your request was rejected; please try again.'
            );
            expect(getLatest).not.toHaveBeenCalled();
            expect(refresh).not.toHaveBeenCalled();
        });

        it('allows another poke only after five minutes, counting down', async () => {
            const { stream } = show();
            await click();
            stream({ pokeId: 'p1', outcome: 'declined' });
            expect(pokeButton().textContent).toBe('Poke again in 5:00');
            expect(pokeButton().disabled).toBe(true);

            await advance(61_000);
            expect(pokeButton().textContent).toBe('Poke again in 3:59');
            await advance(POKE_COOLDOWN_MS - 62_000);
            expect(pokeButton().textContent).toBe('Poke again in 0:01');
            expect(pokeButton().disabled).toBe(true);

            await advance(1000);
            expect(pokeButton().textContent).toBe('Poke');
            expect(pokeButton().disabled).toBe(false);
            await click();
            expect(pokeLock).toHaveBeenCalledTimes(2);
        });

        it('ignores the answer to a request this editor did not make', async () => {
            const { stream } = show();
            await click();
            stream({ pokeId: 'someone-elses', outcome: 'declined' });
            expect(note()).toContain('Waiting for sam@corp.io');
            stream({ pokeId: 'someone-elses', outcome: 'accepted' });
            expect(getLatest).not.toHaveBeenCalled();
        });
    });

    describe('the holder steps out', () => {
        it.each(['accepted', 'left'] as const)(
            'loads the latest version when the answer is %s',
            async (outcome) => {
                const { stream } = show();
                await click();
                await act(async () => stream({ pokeId: 'p1', outcome }));
                expect(note()).toContain(
                    'sam@corp.io has stepped out. Loading the latest version…'
                );
                expect(pokeButton().textContent).toBe('Loading…');
                expect(pokeButton().disabled).toBe(true);
                expect(getLatest).toHaveBeenCalledExactlyOnceWith({
                    localId: 'local-1',
                    remoteId: 'r1',
                    projectSlug: 'billing',
                    deleteLocal: deleteDiagram,
                    beforeDelete: expect.any(Function),
                });
            }
        );

        it('does it once, even when what it depends on is replaced meanwhile', async () => {
            const accepted: PokeResult = { pokeId: 'p1', outcome: 'accepted' };
            const { stream, redraw } = show();
            await click();
            await act(async () => stream(accepted));
            // a new object for the same workspace, as a router that navigates gives
            await act(async () =>
                redraw({ result: accepted, workspace: { ...workspace } })
            );
            await advance(5000);
            expect(getLatest).toHaveBeenCalledTimes(1);
        });

        it('still counts when the answer comes before the reply to the poke', async () => {
            let resolve!: (v: unknown) => void;
            pokeLock.mockReturnValue(new Promise((r) => (resolve = r)));
            const { stream } = show();
            await click();
            stream({ pokeId: 'p1', outcome: 'accepted' });
            expect(getLatest).not.toHaveBeenCalled();
            await act(async () => resolve(sent));
            expect(getLatest).toHaveBeenCalledTimes(1);
        });

        it('reloads when there is no copy here to replace', async () => {
            const { stream } = show({ workspace: null });
            await click();
            await act(async () =>
                stream({ pokeId: 'p1', outcome: 'accepted' })
            );
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(getLatest).not.toHaveBeenCalled();
        });

        it('says so, and lets the user try again at once, when the latest version cannot be loaded', async () => {
            getLatest.mockRejectedValueOnce(new Error('offline'));
            const { stream } = show();
            await click();
            await act(async () =>
                stream({ pokeId: 'p1', outcome: 'accepted' })
            );
            expect(toast).toHaveBeenCalledWith({
                title: 'Could not get the latest version',
                variant: 'destructive',
            });
            expect(note()).toContain('Could not get the latest version');

            // the diagram is already theirs: no five-minute wait to load it again
            expect(pokeButton().textContent).toBe('Poke');
            expect(pokeButton().disabled).toBe(false);
            pokeLock.mockResolvedValue({ status: 'granted' });
            await click();
            expect(getLatest).toHaveBeenCalledTimes(2);
            expect(note()).toContain('Loading the latest version…');
        });
    });

    describe('nobody was editing after all', () => {
        it('takes the diagram at once, without waiting for an answer', async () => {
            pokeLock.mockResolvedValue({ status: 'granted' });
            show();
            await click();
            expect(note()).toContain('Loading the latest version…');
            expect(getLatest).toHaveBeenCalledTimes(1);
        });
    });

    describe('when the server will not take the request', () => {
        it('shows the wait it asks for, as if this page had poked', async () => {
            pokeLock.mockRejectedValue(
                new ApiError(429, 'poke_cooldown', undefined, 120_000)
            );
            show();
            await click();
            expect(pokeButton().textContent).toBe('Poke again in 2:00');
            expect(pokeButton().disabled).toBe(true);
            await advance(120_000);
            expect(pokeButton().disabled).toBe(false);
        });

        it('falls back to the full wait when it did not say how long', async () => {
            pokeLock.mockRejectedValue(new ApiError(429, 'poke_cooldown'));
            show();
            await click();
            expect(pokeButton().textContent).toBe('Poke again in 5:00');
        });

        it.each([
            [
                409,
                'poke_pending',
                'Someone has already asked the editor to step out. Wait for the answer, then try again.',
            ],
            [
                409,
                'lock_busy',
                'This diagram is changing hands right now. Try again in a moment.',
            ],
            [403, 'forbidden', 'You do not have permission to do that.'],
        ])('explains a %s %s', async (status, code, text) => {
            pokeLock.mockRejectedValue(new ApiError(status, code));
            show();
            await click();
            expect(note()).toContain(text);
            // nothing was asked, so nothing has to be waited for
            expect(pokeButton().textContent).toBe('Poke');
            expect(pokeButton().disabled).toBe(false);
        });

        it('says the server could not be reached', async () => {
            pokeLock.mockRejectedValue(new TypeError('Failed to fetch'));
            show();
            await click();
            expect(note()).toContain('Could not reach the server.');
            expect(pokeButton().disabled).toBe(false);
        });
    });
});

describe('TakenBanner announcements (CLI-112)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        pokeLock.mockReset().mockResolvedValue(sent);
        getLatest.mockReset().mockResolvedValue(undefined);
        toast.mockReset();
        refresh.mockReset();
    });
    afterEach(() => vi.useRealTimers());

    it('keeps the ticking countdown out of what a screen reader gets', async () => {
        show();
        await click();
        const live = screen.getByRole('status');
        // the seconds are shown, but hidden from assistive technology
        const shown = within(live).getByText(/\(\d+ s\)/);
        expect(shown.getAttribute('aria-hidden')).toBe('true');
        // what is read out is the one steady line
        expect(
            within(live).getByText('Waiting for an answer…', {
                selector: '.sr-only',
            })
        ).toBeTruthy();
        // and the button's own countdown is not announced either
        expect(pokeButton().getAttribute('aria-live')).toBe('off');
    });
});
