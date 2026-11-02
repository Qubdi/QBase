import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CUSTOM_COLORS_KEY, MAX_CUSTOM_COLORS } from '@/lib/custom-colors';
import {
    resetCustomColorsForTests,
    useCustomColors,
} from '../use-custom-colors';

describe('useCustomColors', () => {
    beforeEach(() => {
        localStorage.clear();
        act(() => resetCustomColorsForTests());
    });

    it('starts empty', () => {
        const { result } = renderHook(() => useCustomColors());
        expect(result.current.colors).toEqual([]);
    });

    it('adds a color, newest first, and stores it', () => {
        const { result } = renderHook(() => useCustomColors());
        act(() => result.current.add('#112233'));
        act(() => result.current.add('#AABBCC'));
        expect(result.current.colors).toEqual(['#aabbcc', '#112233']);
        expect(JSON.parse(localStorage.getItem(CUSTOM_COLORS_KEY)!)).toEqual([
            '#aabbcc',
            '#112233',
        ]);
    });

    it('does not store the same color twice', () => {
        const { result } = renderHook(() => useCustomColors());
        act(() => result.current.add('#112233'));
        act(() => result.current.add('#112233'));
        expect(result.current.colors).toEqual(['#112233']);
    });

    it('removes a color', () => {
        const { result } = renderHook(() => useCustomColors());
        act(() => result.current.add('#112233'));
        act(() => result.current.add('#445566'));
        act(() => result.current.remove('#112233'));
        expect(result.current.colors).toEqual(['#445566']);
    });

    it('ignores a color that is not valid', () => {
        const { result } = renderHook(() => useCustomColors());
        act(() => result.current.add('red'));
        expect(result.current.colors).toEqual([]);
    });

    it('keeps no more than the limit', () => {
        const { result } = renderHook(() => useCustomColors());
        for (let i = 0; i < MAX_CUSTOM_COLORS + 4; i++) {
            act(() => result.current.add(`#${String(i).padStart(6, '0')}`));
        }
        expect(result.current.colors).toHaveLength(MAX_CUSTOM_COLORS);
    });

    it('shares the list between every place that uses it', () => {
        const a = renderHook(() => useCustomColors());
        const b = renderHook(() => useCustomColors());
        act(() => a.result.current.add('#112233'));
        expect(b.result.current.colors).toEqual(['#112233']);
        act(() => b.result.current.remove('#112233'));
        expect(a.result.current.colors).toEqual([]);
    });

    it('picks up colors saved earlier, like after a reload', () => {
        localStorage.setItem(CUSTOM_COLORS_KEY, '["#112233","nope","#445566"]');
        act(() => resetCustomColorsForTests());
        const { result } = renderHook(() => useCustomColors());
        expect(result.current.colors).toEqual(['#112233', '#445566']);
    });

    it('follows a change made in another tab', () => {
        const { result } = renderHook(() => useCustomColors());
        act(() => {
            localStorage.setItem(CUSTOM_COLORS_KEY, '["#778899"]');
            window.dispatchEvent(
                new StorageEvent('storage', { key: CUSTOM_COLORS_KEY })
            );
        });
        expect(result.current.colors).toEqual(['#778899']);
    });

    it('returns the same array while nothing changed', () => {
        const { result, rerender } = renderHook(() => useCustomColors());
        act(() => result.current.add('#112233'));
        const first = result.current.colors;
        rerender();
        expect(result.current.colors).toBe(first);
    });
});
