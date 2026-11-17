import React, { useEffect, useRef, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';

/**
 * Something that takes a press for itself, as the canvas does: its pan and
 * zoom stops `mousedown` on the empty background (d3-zoom calls
 * stopImmediatePropagation), so the event never reaches the document.
 */
const Canvas: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const swallow = (e: Event) => e.stopImmediatePropagation();
        el.addEventListener('mousedown', swallow);
        return () => el.removeEventListener('mousedown', swallow);
    }, []);
    return <div ref={ref} data-testid="canvas" style={{ height: 40 }} />;
};

const Nested: React.FC = () => (
    <Popover>
        <PopoverTrigger asChild>
            <button>open nested</button>
        </PopoverTrigger>
        <PopoverContent>
            <button>nested content</button>
        </PopoverContent>
    </Popover>
);

const Page: React.FC<{
    onOpenChange?: (open: boolean) => void;
    /** the page ignores the request to close, as a controlled popover may */
    keepOpen?: boolean;
    controlled?: boolean;
}> = ({ onOpenChange, keepOpen, controlled }) => {
    const [open, setOpen] = useState(false);
    const props = controlled
        ? {
              open: keepOpen ? true : open,
              onOpenChange: (next: boolean) => {
                  onOpenChange?.(next);
                  if (!keepOpen) setOpen(next);
              },
          }
        : { onOpenChange };
    return (
        <div>
            <Popover {...props}>
                <PopoverTrigger asChild>
                    <button>open</button>
                </PopoverTrigger>
                <PopoverContent>
                    <button>inside</button>
                    <Nested />
                </PopoverContent>
            </Popover>
            <div data-testid="elsewhere">elsewhere</div>
            <Canvas />
        </div>
    );
};

// Radix starts listening for presses one tick after the popover opens
const settle = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 20));
    });
const isOpen = () => screen.queryByRole('button', { name: 'inside' }) !== null;
const opened = async (ui: React.ReactElement) => {
    const user = userEvent.setup();
    render(ui);
    await user.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByRole('button', { name: 'inside' });
    await settle();
    return user;
};
const gone = () => waitFor(() => expect(isOpen()).toBe(false));

describe.each([
    ['uncontrolled', false],
    ['controlled', true],
])('Popover (%s)', (_kind, controlled) => {
    it('opens from its trigger and stays open: the press that opened it is not an outside press', async () => {
        const onOpenChange = vi.fn();
        await opened(
            <Page controlled={controlled} onOpenChange={onOpenChange} />
        );
        await settle();
        expect(isOpen()).toBe(true);
        expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    });

    it('closes when something outside is pressed, and says so once', async () => {
        const onOpenChange = vi.fn();
        const user = await opened(
            <Page controlled={controlled} onOpenChange={onOpenChange} />
        );
        onOpenChange.mockClear();
        await user.click(screen.getByTestId('elsewhere'));
        await gone();
        await settle();
        expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('closes when the thing pressed takes the press for itself (the canvas, whose pan and zoom stops mousedown)', async () => {
        const onOpenChange = vi.fn();
        const user = await opened(
            <Page controlled={controlled} onOpenChange={onOpenChange} />
        );
        onOpenChange.mockClear();
        await user.click(screen.getByTestId('canvas'));
        await gone();
        await settle();
        expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('closes the moment the press goes down on it, as for a drag that never lets go', async () => {
        const user = await opened(<Page controlled={controlled} />);
        await user.pointer({
            keys: '[MouseLeft>]',
            target: screen.getByTestId('canvas'),
        });
        await gone();
    });

    it('closes on Escape', async () => {
        const user = await opened(<Page controlled={controlled} />);
        await user.keyboard('{Escape}');
        await gone();
    });

    it('closes when its trigger is pressed again, and stays closed', async () => {
        const onOpenChange = vi.fn();
        const user = await opened(
            <Page controlled={controlled} onOpenChange={onOpenChange} />
        );
        onOpenChange.mockClear();
        await user.click(screen.getByRole('button', { name: 'open' }));
        await gone();
        await settle();
        expect(isOpen()).toBe(false);
        expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('stays open while its own content is pressed', async () => {
        const onOpenChange = vi.fn();
        const user = await opened(
            <Page controlled={controlled} onOpenChange={onOpenChange} />
        );
        onOpenChange.mockClear();
        await user.click(screen.getByRole('button', { name: 'inside' }));
        await settle();
        expect(isOpen()).toBe(true);
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('stays open while something that opened from inside it (another popover) is pressed', async () => {
        const user = await opened(<Page controlled={controlled} />);
        await user.click(screen.getByRole('button', { name: 'open nested' }));
        await screen.findByRole('button', { name: 'nested content' });
        await settle();
        await user.click(
            screen.getByRole('button', { name: 'nested content' })
        );
        await settle();
        expect(isOpen()).toBe(true);
        expect(
            screen.queryByRole('button', { name: 'nested content' })
        ).not.toBeNull();
    });

    it('can be opened and closed again and again', async () => {
        const user = await opened(<Page controlled={controlled} />);
        await user.click(screen.getByTestId('canvas'));
        await gone();
        for (let i = 0; i < 2; i += 1) {
            await user.click(screen.getByRole('button', { name: 'open' }));
            await screen.findByRole('button', { name: 'inside' });
            await settle();
            await user.click(screen.getByTestId('canvas'));
            await gone();
        }
    });
});

describe('Popover held open by its page', () => {
    it('is told to close at every outside press, and is not closed by itself', async () => {
        const onOpenChange = vi.fn();
        const user = await opened(
            <Page controlled keepOpen onOpenChange={onOpenChange} />
        );
        onOpenChange.mockClear();
        await user.click(screen.getByTestId('canvas'));
        await settle();
        expect(isOpen()).toBe(true);
        expect(onOpenChange).toHaveBeenCalledWith(false);
        // a refusal is not remembered: the next press asks again
        const before = onOpenChange.mock.calls.length;
        await user.click(screen.getByTestId('canvas'));
        await settle();
        expect(onOpenChange.mock.calls.length).toBeGreaterThan(before);
        expect(isOpen()).toBe(true);
    });
});
