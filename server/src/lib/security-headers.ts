/**
 * Headers every API response carries: it returns JSON, never a page, so framing
 * and sniffing are forbidden and a browser that renders a response runs nothing
 * from it. The event stream writes its own head, so it spreads these in too.
 */
export const API_SECURITY_HEADERS = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
} as const;

/** Two years, as hstspreload.org asks; sent only where the connection is https. */
export const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

/**
 * The Strict-Transport-Security header for a response, or none. A browser
 * ignores it over plain http, so it goes out only when the request came in over
 * https (as seen through TRUST_PROXY) or COOKIE_SECURE says the site is https.
 */
export const hstsHeaders = (
    req: { protocol: string },
    cookieSecure: boolean | 'auto'
): Record<string, string> =>
    req.protocol === 'https' || cookieSecure === true
        ? { 'strict-transport-security': HSTS_VALUE }
        : {};
