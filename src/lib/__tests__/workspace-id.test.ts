import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDiagramId, getWorkspaceId } from '../utils/utils';

describe('getWorkspaceId', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('keeps one id in storage', () => {
        const id = getWorkspaceId();
        expect(localStorage.getItem('uuid')).toBe(id);
        expect(getWorkspaceId()).toBe(id);
    });

    it('still gives ids when the browser refuses storage', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('blocked', 'SecurityError');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('blocked', 'SecurityError');
        });
        const first = getWorkspaceId();
        expect(first).toBeTruthy();
        // one prefix for the whole visit
        expect(getWorkspaceId()).toBe(first);
        expect(generateDiagramId().startsWith(first)).toBe(true);
    });
});
