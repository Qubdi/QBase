import { describe, expect, it, vi } from 'vitest';
import { createSseWriter } from '../src/lib/sse-write.js';

const stream = (accepts: boolean, buffered: number) => ({
    write: vi.fn(() => accepts),
    writableLength: buffered,
});

describe('createSseWriter', () => {
    it('writes and keeps the stream open while the viewer keeps up', () => {
        const raw = stream(true, 0);
        const close = vi.fn();
        createSseWriter(raw, close)('hello');
        expect(raw.write).toHaveBeenCalledWith('hello');
        expect(close).not.toHaveBeenCalled();
    });

    it('tolerates a short backlog, as when the socket is briefly busy', () => {
        const close = vi.fn();
        createSseWriter(stream(false, 1_000), close, 10_000)('x');
        expect(close).not.toHaveBeenCalled();
    });

    it('closes the stream when too much is waiting unsent', () => {
        const close = vi.fn();
        createSseWriter(stream(false, 20_000), close, 10_000)('x');
        expect(close).toHaveBeenCalledTimes(1);
    });
});
