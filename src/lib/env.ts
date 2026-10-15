export const IS_HOSTED_CLOUD: boolean =
    import.meta.env.VITE_IS_HOSTED_CLOUD === 'true';
export const APP_URL: string = import.meta.env.VITE_APP_URL;
export const HOST_URL: string = import.meta.env.VITE_HOST_URL ?? '';
// QubdiDB has no cloud promotions: hidden unless explicitly set to 'false'
export const HIDE_CLOUD: boolean =
    (window?.env?.HIDE_CLOUD ?? import.meta.env.VITE_HIDE_CLOUD ?? 'true') !==
    'false';
// no analytics unless explicitly enabled
export const DISABLE_ANALYTICS: boolean =
    (window?.env?.DISABLE_ANALYTICS ??
        import.meta.env.VITE_DISABLE_ANALYTICS ??
        'true') !== 'false';
