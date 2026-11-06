export {};

declare global {
    interface Window {
        /** Set by /config.js, which the server writes when the container starts. */
        env?: {
            QUBDI_BACKEND_URL?: string;
        };
    }
}
