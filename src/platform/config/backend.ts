/**
 * The one switch of the app: is a backend configured? The URL comes from
 * /config.js at run time (window.env), else from the build-time variable used
 * by `npm run dev`. A trailing slash is removed; empty means local mode.
 */
export const readBackendUrl = (): string =>
    (
        window.env?.QUBDI_BACKEND_URL ||
        import.meta.env.VITE_QUBDI_BACKEND_URL ||
        ''
    ).replace(/\/+$/, '');

export const BACKEND_URL: string = readBackendUrl();
export const BACKEND_ENABLED: boolean = BACKEND_URL !== '';
