import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalConfigProvider } from '../local-config-provider';
import { LocalConfigContext } from '../local-config-context';
import { readStored, writeStored } from '../stored';

const refuse = () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
    });
};

describe('stored settings', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it('reads and writes through localStorage', () => {
        writeStored('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
        expect(readStored('k')).toBe('v');
        expect(readStored('missing')).toBeNull();
    });

    it('treats a browser that refuses storage as having nothing saved', () => {
        refuse();
        expect(readStored('k')).toBeNull();
        expect(() => writeStored('k', 'v')).not.toThrow();
    });

    it('lets the page open with the defaults when storage is refused', () => {
        refuse();
        const Probe = () => {
            const config = React.useContext(LocalConfigContext);
            return (
                <p>
                    {config.theme} {String(config.showCardinality)}{' '}
                    {config.scrollAction}
                </p>
            );
        };
        render(
            <LocalConfigProvider>
                <Probe />
            </LocalConfigProvider>
        );
        expect(screen.getByText('system true pan')).toBeTruthy();
    });

    it('still reads what is saved when storage works', () => {
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('show_cardinality', 'false');
        const Probe = () => {
            const config = React.useContext(LocalConfigContext);
            return (
                <p>
                    {config.theme} {String(config.showCardinality)}
                </p>
            );
        };
        render(
            <LocalConfigProvider>
                <Probe />
            </LocalConfigProvider>
        );
        expect(screen.getByText('dark false')).toBeTruthy();
    });
});
