export {};

declare global {
    interface Window {
        /** Set by /config.js, which the server answers itself (see server/src/web.ts). */
        env?: {
            QUBDI_BACKEND_URL?: string;
        };
    }
}
