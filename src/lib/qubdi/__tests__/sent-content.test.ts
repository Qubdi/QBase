import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    confirmSentContent,
    isLastSentContent,
    markSyncedContent,
    rememberSentContent,
} from '../sent-content';

describe('sent content', () => {
    beforeEach(() => {
        sessionStorage.clear();
        confirmSentContent('d1');
    });

    it('recognises what was sent, whatever the key order or updatedAt', () => {
        rememberSentContent('d1', { a: 1, b: { c: 2, d: 3 } });
        expect(
            isLastSentContent('d1', {
                b: { d: 3, c: 2 },
                a: 1,
                updatedAt: 'x',
            })
        ).toBe(true);
    });

    it('does not recognise content that was not sent', () => {
        rememberSentContent('d1', { a: 1 });
        expect(isLastSentContent('d1', { a: 2 })).toBe(false);
        expect(isLastSentContent('d1', null)).toBe(false);
    });

    it('keeps an earlier send when a later one follows', () => {
        rememberSentContent('d1', { a: 1 });
        rememberSentContent('d1', { a: 2 });
        expect(isLastSentContent('d1', { a: 1 })).toBe(true);
    });

    it('forgets everything once a save is confirmed', () => {
        rememberSentContent('d1', { a: 1 });
        confirmSentContent('d1');
        expect(isLastSentContent('d1', { a: 1 })).toBe(false);
    });

    it('forgets only the confirmed send when others may still be in flight', () => {
        rememberSentContent('d1', { a: 1 });
        rememberSentContent('d1', { a: 2 });
        confirmSentContent('d1', { a: 2 });
        expect(isLastSentContent('d1', { a: 2 })).toBe(false);
        expect(isLastSentContent('d1', { a: 1 })).toBe(true);
    });

    it('is separate for each diagram', () => {
        rememberSentContent('d1', { a: 1 });
        expect(isLastSentContent('d2', { a: 1 })).toBe(false);
    });

    describe('one save, one fingerprint', () => {
        afterEach(() => vi.restoreAllMocks());

        // the sorted-key write-out is the one that takes a replacer function
        const sortedWriteOuts = (calls: unknown[][]) =>
            calls.filter((args) => typeof args[1] === 'function').length;

        it('writes the content out once for remember, confirm and mark synced', () => {
            const content = { a: 1, b: { c: 2 } };
            const stringify = vi.spyOn(JSON, 'stringify');
            rememberSentContent('d1', content);
            confirmSentContent('d1', content);
            markSyncedContent('d1', content);
            expect(sortedWriteOuts(stringify.mock.calls)).toBe(1);
        });

        it('still tells different content apart', () => {
            rememberSentContent('d1', { a: 1 });
            const second = { a: 2 };
            expect(isLastSentContent('d1', second)).toBe(false);
            rememberSentContent('d1', second);
            expect(isLastSentContent('d1', { a: 2 })).toBe(true);
        });
    });
});
