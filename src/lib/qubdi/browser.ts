// A readable name for the browser a session came from, so an admin can tell
// sessions apart without reading a User-Agent string. It is a best guess from
// a string the browser chooses itself: good for "which of these is mine", not
// for deciding anything about security.

/** Checked in this order: most browsers also say "Chrome" or "Safari". */
const BROWSERS: [name: string, pattern: RegExp][] = [
    ['Edge', /\bEdg(?:e|A|iOS)?\//],
    ['Opera', /\b(?:OPR|Opera)\//],
    ['Firefox', /\b(?:Firefox|FxiOS)\//],
    ['Chrome', /\b(?:Chrome|CriOS)\//],
    ['Safari', /\bSafari\//],
];

/** iPhone and iPad say "like Mac OS X", and Android says "Linux": check them first. */
const SYSTEMS: [name: string, pattern: RegExp][] = [
    ['iOS', /\b(?:iPhone|iPad|iPod)\b/],
    ['Android', /\bAndroid\b/],
    ['Windows', /\bWindows\b/],
    ['macOS', /\bMac OS X\b|\bMacintosh\b/],
    ['ChromeOS', /\bCrOS\b/],
    ['Linux', /\bLinux\b|\bX11\b/],
];

const firstMatch = (list: [string, RegExp][], userAgent: string) =>
    list.find(([, pattern]) => pattern.test(userAgent))?.[0];

/** "Chrome on Windows", "Firefox on Linux", or "Unknown browser". */
export function describeBrowser(userAgent: string | null | undefined): string {
    if (!userAgent) return 'Unknown browser';
    const browser = firstMatch(BROWSERS, userAgent);
    if (!browser) return 'Unknown browser';
    const system = firstMatch(SYSTEMS, userAgent);
    return system ? `${browser} on ${system}` : browser;
}
