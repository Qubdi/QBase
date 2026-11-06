import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const order = vi.hoisted(() => [] as string[]);
const fakeMonaco = vi.hoisted(() => ({ editor: {} }));

vi.mock('@monaco-editor/react', () => ({
    loader: {
        init: vi.fn(async () => {
            order.push('loader.init');
            return fakeMonaco;
        }),
    },
}));
// importing the config chunk is what registers the bundled Monaco
vi.mock('../config', () => {
    order.push('config');
    return {};
});

import { useBundledMonaco } from '../use-bundled-monaco';

describe('useBundledMonaco', () => {
    it('registers the bundled copy before the loader is asked, then returns Monaco', async () => {
        const { result } = renderHook(() => useBundledMonaco());
        expect(result.current).toBeNull();
        await waitFor(() => expect(result.current).toBe(fakeMonaco));
        expect(order).toEqual(['config', 'loader.init']);
    });
});
