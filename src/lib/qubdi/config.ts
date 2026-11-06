// The backend is optional; leave both unset for local-only mode. A deployed
// image gets the URL at run time from /config.js (QUBDI_BACKEND_URL); during
// `npm run dev` it comes from VITE_QUBDI_BACKEND_URL.
export const QUBDI_BACKEND_URL: string = (
    window.env?.QUBDI_BACKEND_URL ||
    import.meta.env.VITE_QUBDI_BACKEND_URL ||
    ''
).replace(/\/$/, '');

export const QUBDI_BACKEND_ENABLED: boolean = QUBDI_BACKEND_URL !== '';
