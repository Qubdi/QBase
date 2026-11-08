import { describe, expect, it } from 'vitest';

// the build helper sits beside vite.config.ts, outside the app's source folder
type Keep = (file: string) => boolean | undefined;
const loadKeep = async (): Promise<Keep> => {
    const file = '../../vite.fonts.ts';
    const mod = (await import(/* @vite-ignore */ file)) as {
        keepFontsAsFiles: Keep;
    };
    return mod.keepFontsAsFiles;
};

// The server answers with font-src 'self', so a font inlined as a data: URI is
// refused by the browser (found in a real-browser run of the Docker image).
describe('font files in the build', () => {
    it('are never inlined as data: URIs, whatever their size', async () => {
        const keepFontsAsFiles = await loadKeep();
        for (const file of [
            'a/inter-latin-400-normal.woff2',
            'a/inter-latin-400-normal.woff',
            'b/x.TTF',
            'c/y.otf',
        ]) {
            expect(keepFontsAsFiles(file)).toBe(false);
        }
    });

    it('leave other assets to the default limit', async () => {
        const keepFontsAsFiles = await loadKeep();
        expect(keepFontsAsFiles('logo.svg')).toBeUndefined();
        expect(keepFontsAsFiles('pic.png')).toBeUndefined();
    });
});
