import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from '../save-blob';

describe('saveBlob', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
    });
    afterEach(() => vi.useRealTimers());

    it('keeps the address long enough for the browser to start the download', () => {
        saveBlob(new Blob(['a']), 'a.txt');
        vi.advanceTimersByTime(1000);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(30_000);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    });
});
