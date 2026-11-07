import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('page shell (SHL-004 to SHL-007)', () => {
    const html = read('index.html');

    it('SHL-004: the theme is set by a separate script in the head, not inline', () => {
        const scripts = [
            ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
        ];
        expect(scripts.length).toBeGreaterThan(0);
        for (const [, attrs, body] of scripts) {
            expect(attrs).toMatch(/\bsrc="\//);
            expect(body.trim()).toBe('');
        }
        const head = html.slice(0, html.indexOf('</head>'));
        const theme = head.indexOf('/theme-init.js');
        expect(theme).toBeGreaterThan(-1);
        // before the app bundle, which sits in the body
        expect(html.indexOf('/src/main.tsx')).toBeGreaterThan(theme);
        expect(existsSync(join(root, 'public/theme-init.js'))).toBe(true);
        expect(head).toContain('/config.js');
    });

    describe('theme-init.js', () => {
        const script = read('public/theme-init.js');
        const run = (saved: string | null, osDark: boolean) => {
            document.documentElement.className = '';
            document.documentElement.style.colorScheme = '';
            if (saved === null) localStorage.removeItem('theme');
            else localStorage.setItem('theme', saved);
            vi.stubGlobal('matchMedia', () => ({ matches: osDark }));
            (0, eval)(script);
        };
        afterEach(() => {
            vi.unstubAllGlobals();
            localStorage.removeItem('theme');
            document.documentElement.className = '';
        });

        it('adds the dark class for a saved dark theme and for System on a dark OS', () => {
            run('dark', false);
            expect(document.documentElement.classList.contains('dark')).toBe(
                true
            );
            run(null, true);
            expect(document.documentElement.classList.contains('dark')).toBe(
                true
            );
            expect(document.documentElement.style.colorScheme).toBe('dark');
        });

        it('leaves the page light for a saved light theme and for System on a light OS', () => {
            run('light', true);
            expect(document.documentElement.classList.contains('dark')).toBe(
                false
            );
            run('system', false);
            expect(document.documentElement.classList.contains('dark')).toBe(
                false
            );
            expect(document.documentElement.style.colorScheme).toBe('light');
        });

        it('keeps the default look when storage refuses', () => {
            vi.stubGlobal('matchMedia', () => ({ matches: true }));
            const spy = vi
                .spyOn(Storage.prototype, 'getItem')
                .mockImplementation(() => {
                    throw new Error('refused');
                });
            expect(() => (0, eval)(script)).not.toThrow();
            spy.mockRestore();
        });
    });

    it('SHL-005: nothing is loaded from another origin and nothing runs inline', () => {
        // the page itself
        expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
        expect(html).not.toMatch(/\son[a-z]+="/i);
        // the styles
        const css = read('src/globals.css');
        expect(css).not.toMatch(/@import\s+(url\()?['"]?https?:/);
        expect(css).not.toMatch(/url\(\s*['"]?https?:/);
        // every source file: no link/script/img tag or import that reaches out
        const found: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const path = join(dir, name);
                if (statSync(path).isDirectory()) {
                    if (name !== '__tests__' && name !== 'test') walk(path);
                } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) {
                    const text = readFileSync(path, 'utf8');
                    if (/<script[\s>]/.test(text) && !path.includes('helmet'))
                        found.push(`${path}: inline script`);
                    if (
                        /<(link|script|img)\b[^>]*(src|href)=["']https?:\/\//.test(
                            text
                        )
                    )
                        found.push(`${path}: external tag`);
                    if (/from ['"]https?:\/\//.test(text))
                        found.push(`${path}: url import`);
                }
            }
        };
        walk(join(root, 'src'));
        expect(found).toEqual([]);
    });

    it('SHL-006: the three font families are bundled packages imported from code', () => {
        const main = read('src/main.tsx');
        for (const family of ['inter', 'jetbrains-mono', 'manrope'])
            expect(main).toContain(`@fontsource/${family}/`);
        const pkg = JSON.parse(read('package.json')) as {
            dependencies: Record<string, string>;
        };
        for (const family of ['inter', 'jetbrains-mono', 'manrope'])
            expect(pkg.dependencies[`@fontsource/${family}`]).toBeTruthy();
        // weights named by the spec
        for (const weight of [
            'inter/400',
            'inter/500',
            'inter/600',
            'jetbrains-mono/400',
            'jetbrains-mono/500',
        ])
            expect(main).toContain(`@fontsource/${weight}.css`);
        for (const weight of [500, 600, 700, 800])
            expect(main).toContain(`@fontsource/manrope/${weight}.css`);
    });

    it('SHL-007: noindex, robots.txt disallows all, empty favicon, device-width viewport', () => {
        expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/);
        expect(html).toContain('<link href="data:," rel="icon" />');
        expect(html).toContain(
            '<meta name="viewport" content="width=device-width, initial-scale=1" />'
        );
        expect(html).toContain('<html lang="en">');
        const robots = read('public/robots.txt');
        expect(robots).toMatch(/User-agent: \*/);
        expect(robots).toMatch(/Disallow: \/\s*$/m);
    });
});

describe('what the first load contains (SHL-017)', () => {
    const SRC = join(root, 'src');
    const resolveImport = (from: string, spec: string): string | undefined => {
        let base: string;
        if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
        else if (spec.startsWith('.')) base = resolve(from, '..', spec);
        else return undefined;
        for (const candidate of [
            `${base}.ts`,
            `${base}.tsx`,
            join(base, 'index.ts'),
            join(base, 'index.tsx'),
            base,
        ])
            if (existsSync(candidate) && statSync(candidate).isFile())
                return candidate;
        return undefined;
    };
    const closure = (entry: string) => {
        const seen = new Set<string>();
        const packages = new Set<string>();
        const visit = (file: string) => {
            if (seen.has(file)) return;
            seen.add(file);
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(
                /^(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm
            )) {
                const next = resolveImport(file, m[1]);
                if (next && /\.tsx?$/.test(next)) visit(next);
                else if (!m[1].startsWith('.') && !m[1].startsWith('@/'))
                    packages.add(m[1]);
            }
            for (const m of text.matchAll(/^import\s+['"]([^'"]+)['"]/gm)) {
                const next = resolveImport(file, m[1]);
                if (next && /\.tsx?$/.test(next)) visit(next);
            }
        };
        visit(entry);
        return { files: [...seen], packages: [...packages] };
    };

    it('the start-up code does not pull in the admin, viewer, editor or the DBML parser', () => {
        const { files, packages } = closure(join(SRC, 'main.tsx'));
        const rel = files.map((f) => f.slice(SRC.length + 1));
        expect(
            rel.filter((f) => f.startsWith('pages/admin-page/admin-page.'))
        ).toEqual([]);
        expect(
            rel.filter((f) => f.startsWith('pages/admin-page/admin-section.'))
        ).toEqual([]);
        expect(
            rel.filter((f) => f.startsWith('pages/share-viewer-page'))
        ).toEqual([]);
        expect(rel.filter((f) => f.startsWith('pages/home-page'))).toEqual([]);
        expect(rel).not.toContain('workspace/editor-page.tsx');
        expect(rel).not.toContain('formats/dbml/import-dbml.ts');
        expect(packages.filter((p) => p.startsWith('@dbml'))).toEqual([]);
    });

    it('the editor page itself does not pull in the DBML parser either', () => {
        const { files, packages } = closure(
            join(SRC, 'workspace/editor-page.tsx')
        );
        const rel = files.map((f) => f.slice(SRC.length + 1));
        expect(rel).not.toContain('formats/dbml/import-dbml.ts');
        expect(packages.filter((p) => p.startsWith('@dbml'))).toEqual([]);
    });
});

describe('one image serves everything (SHL-115)', () => {
    const docker = read('Dockerfile');

    it('the image has the built editor, serves it with the API on port 3001 and compresses the files', () => {
        expect(docker).toMatch(/^EXPOSE 3001$/m);
        expect(docker).toMatch(/^ENV WEB_DIR=\/app\/web$/m);
        expect(docker).toContain('precompress-web.mjs dist');
        expect(docker).toMatch(/COPY --from=web .*\/dist \/app\/web/);
        // the editor is told its API address at run time, never at build time
        expect(docker).not.toMatch(/VITE_QUBDI_BACKEND_URL/);
    });

    it('SHL-025: there is no tour, welcome screen or onboarding text in the editor strings', () => {
        const strings = [
            read('src/i18n/editor/workspace.ts'),
            read('src/i18n/editor/designs.ts'),
            read('src/i18n/qubdi/workspace.ts'),
        ].join('\n');
        expect(strings).not.toMatch(
            /\b(welcome|tour|onboarding|getting started|tutorial)\b/i
        );
    });
});
