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
