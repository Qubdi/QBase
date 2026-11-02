import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const load = async () => {
    vi.resetModules();
    return import('../config');
};

describe('backend url config', () => {
    beforeEach(() => {
        window.env = undefined;
        vi.unstubAllEnvs();
    });
    afterEach(() => {
        window.env = undefined;
        vi.unstubAllEnvs();
    });

    it('is off (local-only mode) when nothing is set', async () => {
        vi.stubEnv('VITE_QUBDI_BACKEND_URL', '');
        const config = await load();
        expect(config.QUBDI_BACKEND_URL).toBe('');
        expect(config.QUBDI_BACKEND_ENABLED).toBe(false);
    });

    it('reads the run-time value served through /config.js', async () => {
        vi.stubEnv('VITE_QUBDI_BACKEND_URL', '');
        window.env = { QUBDI_BACKEND_URL: 'https://api.example.com/' };
        const config = await load();
        // the trailing slash is dropped
        expect(config.QUBDI_BACKEND_URL).toBe('https://api.example.com');
        expect(config.QUBDI_BACKEND_ENABLED).toBe(true);
    });

    it('prefers the run-time value over the build-time one', async () => {
        vi.stubEnv('VITE_QUBDI_BACKEND_URL', 'http://localhost:3001');
        window.env = { QUBDI_BACKEND_URL: 'https://api.example.com' };
        expect((await load()).QUBDI_BACKEND_URL).toBe(
            'https://api.example.com'
        );
    });

    it('falls back to the build-time value when /config.js leaves it empty', async () => {
        vi.stubEnv('VITE_QUBDI_BACKEND_URL', 'http://localhost:3001');
        window.env = { QUBDI_BACKEND_URL: '' };
        expect((await load()).QUBDI_BACKEND_URL).toBe('http://localhost:3001');
    });
});
