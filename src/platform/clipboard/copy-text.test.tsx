import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { Toaster } from '@/platform/toast/toaster';
import { resetToasts } from '@/platform/toast/use-toast';
import { copyText } from './copy-text';

const setClipboard = (value: unknown) =>
    Object.defineProperty(navigator, 'clipboard', {
        value,
        configurable: true,
    });

afterEach(() => {
    act(() => resetToasts());
    setClipboard(undefined);
    vi.restoreAllMocks();
});

// EDT-272: a failed copy shows one toast, "Copy failed", with the reason.
describe('copying text (EDT-272)', () => {
    it('writes the text and shows nothing when the browser allows it', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        setClipboard({ writeText });
        render(<Toaster />);
        let ok = false;
        await act(async () => {
            ok = await copyText('hello');
        });
        expect(ok).toBe(true);
        expect(writeText).toHaveBeenCalledWith('hello');
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('says the clipboard is not supported when the browser has none', async () => {
        setClipboard(undefined);
        render(<Toaster />);
        let ok = true;
        await act(async () => {
            ok = await copyText('hello');
        });
        expect(ok).toBe(false);
        expect(await screen.findByText('Copy failed')).toBeInTheDocument();
        expect(
            screen.getByText('Clipboard not supported.')
        ).toBeInTheDocument();
    });

    it('says something went wrong when the write is refused', async () => {
        setClipboard({
            writeText: vi.fn().mockRejectedValue(new Error('denied')),
        });
        render(<Toaster />);
        let ok = true;
        await act(async () => {
            ok = await copyText('hello');
        });
        expect(ok).toBe(false);
        expect(await screen.findByText('Copy failed')).toBeInTheDocument();
        expect(
            screen.getByText('Something went wrong. Please try again.')
        ).toBeInTheDocument();
    });

    it('has the wording in every shipped language', async () => {
        type Locale = Record<
            string,
            {
                translation: {
                    editor: { common: { copyFailed: Record<string, string> } };
                };
            }
        >;
        const files = import.meta.glob<Locale>([
            '../../i18n/locales/*.ts',
            '!../../i18n/locales/en.ts',
        ]);
        const codes = Object.keys(files).map((file) =>
            file.replace(/^.*\//, '').replace(/\.ts$/, '')
        );
        expect(codes.sort()).toEqual(['de', 'fr', 'it', 'ru'].sort());
        for (const [file, load] of Object.entries(files)) {
            const code = file.replace(/^.*\//, '').replace(/\.ts$/, '');
            const block = (await load())[code].translation.editor.common
                .copyFailed;
            for (const key of ['title', 'unsupported', 'generic']) {
                expect(block[key], `${code} ${key}`).toBeTruthy();
                expect(block[key], `${code} ${key}`).not.toBe(
                    i18n.getResource(
                        'en',
                        'translation',
                        `editor.common.copyFailed.${key}`
                    )
                );
            }
        }
    });
});

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory())
            return name === '__tests__' ? [] : walk(path);
        return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });

describe('every editor copy goes through the helper (EDT-272)', () => {
    it('no editor code writes to the clipboard on its own', () => {
        const direct = [
            'src/features',
            'src/pages',
            'src/workspace',
            'src/canvas',
        ]
            .flatMap(walk)
            .filter((file) =>
                readFileSync(file, 'utf8').includes('clipboard.writeText')
            );
        expect(direct).toEqual([]);
    });
});
