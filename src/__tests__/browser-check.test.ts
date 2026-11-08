import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// SHL-103 (owner decision 2026-11-08): QBase supports Safari 16.4 and newer. An older
// browser gets a short notice from public/browser-check.js instead of a blank page.
const script = readFileSync('public/browser-check.js', 'utf8');

const run = () => new Function(script)();

const reset = () => {
    Reflect.deleteProperty(window, '__qbaseUnsupported');
    document.body.innerHTML = '<main id="root"><p>app</p></main>';
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    reset();
});

describe('browser check', () => {
    it('does nothing in a browser that has every feature', () => {
        reset();
        run();
        expect(Reflect.get(window, '__qbaseUnsupported')).toBeUndefined();
        expect(document.getElementById('root')!.textContent).toBe('app');
    });

    it('shows a notice when a needed browser function is missing', () => {
        reset();
        vi.stubGlobal('ResizeObserver', undefined);
        run();
        expect(Reflect.get(window, '__qbaseUnsupported')).toBe(true);
        const alert = document.querySelector('#root [role=alert]');
        expect(alert?.textContent).toContain('Safari 16.4');
        expect(document.getElementById('root')!.textContent).not.toContain(
            'app'
        );
    });

    it('speaks the language of the browser and falls back to English', () => {
        const texts: Record<string, string> = {};
        for (const language of [
            'ru-RU',
            'de-AT',
            'it',
            'fr-CA',
            'zh-TW',
            'ja',
        ]) {
            reset();
            vi.stubGlobal('ResizeObserver', undefined);
            vi.spyOn(navigator, 'languages', 'get').mockReturnValue([language]);
            run();
            texts[language] =
                document.querySelector('[role=alert]')!.textContent!;
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        }
        expect(texts['ru-RU']).toContain('Для QBase');
        expect(texts['de-AT']).toContain('benötigt');
        expect(texts.it).toContain('richiede');
        expect(texts['fr-CA']).toContain('nécessite');
        expect(texts['zh-TW']).toContain('需要');
        expect(texts.ja).toContain('needs a newer browser');
    });

    it('is loaded by the page before the app and the other scripts', () => {
        const html = readFileSync('index.html', 'utf8');
        const check = html.indexOf('/browser-check.js');
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(html.indexOf('/theme-init.js'));
        expect(check).toBeLessThan(html.indexOf('/src/main.tsx'));
        expect(html).not.toMatch(/<script>[^<]/);
    });

    it('needs no eval, which the Content-Security-Policy forbids', () => {
        expect(script).not.toMatch(
            /\beval\s*\(|new Function|setTimeout\(\s*['"]/
        );
    });
});
