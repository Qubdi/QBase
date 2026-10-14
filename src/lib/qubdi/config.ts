// The backend is optional. Leave VITE_QUBDI_BACKEND_URL unset for local-only mode.
export const QUBDI_BACKEND_URL: string = (
    import.meta.env.VITE_QUBDI_BACKEND_URL ?? ''
).replace(/\/$/, '');

export const QUBDI_BACKEND_ENABLED: boolean = QUBDI_BACKEND_URL !== '';
