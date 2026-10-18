import { beforeEach, describe, expect, it } from 'vitest';
import {
    confirmSentContent,
    isLastSentContent,
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

    it('is separate for each diagram', () => {
        rememberSentContent('d1', { a: 1 });
        expect(isLastSentContent('d2', { a: 1 })).toBe(false);
    });
});
