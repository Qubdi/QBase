import { describe, expect, it } from 'vitest';
import { describeBrowser } from '../browser';

const WINDOWS = 'Windows NT 10.0; Win64; x64';
const CHROME = `Mozilla/5.0 (${WINDOWS}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`;

describe('describeBrowser', () => {
    it.each([
        ['Chrome on Windows', CHROME],
        // Edge, Opera and Chrome on a phone all also say "Chrome" and "Safari"
        ['Edge on Windows', `${CHROME} Edg/126.0.0.0`],
        ['Opera on Windows', `${CHROME} OPR/111.0.0.0`],
        [
            'Firefox on Linux',
            'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
        ],
        [
            'Firefox on Windows',
            `Mozilla/5.0 (${WINDOWS}; rv:128.0) Gecko/20100101 Firefox/128.0`,
        ],
        [
            'Safari on macOS',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        ],
        [
            'Chrome on macOS',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        ],
        // an iPhone says "like Mac OS X": it is iOS, not macOS
        [
            'Safari on iOS',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        ],
        [
            'Chrome on iOS',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
        ],
        [
            'Safari on iOS',
            'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        ],
        // Android says "Linux": it is Android
        [
            'Chrome on Android',
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        ],
        [
            'Chrome on ChromeOS',
            'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        ],
        [
            'Edge on Android',
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0',
        ],
    ])('says %s', (expected, userAgent) => {
        expect(describeBrowser(userAgent)).toBe(expected);
    });

    it('names the browser alone when it gives no system', () => {
        expect(describeBrowser('Firefox/128.0')).toBe('Firefox');
    });

    it.each([null, undefined, '', 'curl/8.4.0', 'node', 'lightMyRequest'])(
        'says "Unknown browser" for %j',
        (userAgent) => {
            expect(describeBrowser(userAgent)).toBe('Unknown browser');
        }
    );

    it('copes with the longest value the server keeps', () => {
        const long = 'Mozilla/5.0 '.repeat(20).slice(0, 200);
        expect(describeBrowser(long)).toBe('Unknown browser');
    });
});
