import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearRemoteId,
    getProjectId,
    getRemoteId,
    setProjectId,
    setRemoteId,
} from '../remote-map';

describe('remote map', () => {
    beforeEach(() => localStorage.clear());

    it('stores and reads mappings per local id', () => {
        setRemoteId('local-1', 'remote-1');
        setRemoteId('local-2', 'remote-2');
        expect(getRemoteId('local-1')).toBe('remote-1');
        expect(getRemoteId('local-2')).toBe('remote-2');
        expect(getRemoteId('missing')).toBeUndefined();
    });

    it('clears one mapping without touching others', () => {
        setRemoteId('a', '1');
        setRemoteId('b', '2');
        clearRemoteId('a');
        expect(getRemoteId('a')).toBeUndefined();
        expect(getRemoteId('b')).toBe('2');
    });

    it('survives corrupted storage', () => {
        localStorage.setItem('qubdidb.remote-map', '{not json');
        expect(getRemoteId('a')).toBeUndefined();
        setRemoteId('a', '1');
        expect(getRemoteId('a')).toBe('1');
    });

    it('remembers the project of a bound diagram and forgets it on unbind', () => {
        setRemoteId('a', 'r1');
        setProjectId('a', 'p1');
        setProjectId('b', 'p2');
        expect(getProjectId('a')).toBe('p1');
        expect(getProjectId('missing')).toBeUndefined();
        clearRemoteId('a');
        expect(getProjectId('a')).toBeUndefined();
        expect(getProjectId('b')).toBe('p2');
    });

    it('survives corrupted project storage', () => {
        localStorage.setItem('qubdidb.remote-project', '[oops');
        expect(getProjectId('a')).toBeUndefined();
        setProjectId('a', 'p1');
        expect(getProjectId('a')).toBe('p1');
    });
});
