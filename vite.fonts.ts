// Vite inlines assets under 4 KB as data: URIs. For the small font subsets that
// broke the server's policy (font-src 'self'), so fonts are always real files.
export const keepFontsAsFiles = (file: string): boolean | undefined =>
    /\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined;
