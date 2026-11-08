import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { i18n, languages } from '@/i18n/i18n';

const ROOT = resolve(__dirname, '..');
const REPO = resolve(ROOT, '..');
const uiModules = import.meta.glob<Record<string, unknown>>(
    '../platform/ui/*.tsx'
);
const localeModules = import.meta.glob<Record<string, unknown>>(
    '../i18n/locales/*.ts'
);

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
    });

const isCode = (f: string) =>
    /\.(ts|tsx)$/.test(f) &&
    !/\.test\.tsx?$/.test(f) &&
    !f.includes('__tests__');

const importsOf = (file: string): string[] => {
    const text = readFileSync(file, 'utf8');
    return [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
        (m) => m[1]
    );
};

/** the source file an import points at, or undefined for packages */
const resolveImport = (from: string, spec: string): string | undefined => {
    const base = spec.startsWith('@/')
        ? join(ROOT, spec.slice(2))
        : spec.startsWith('.')
          ? resolve(dirname(from), spec)
          : undefined;
    if (!base) return undefined;
    for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        join(base, 'index.ts'),
        join(base, 'index.tsx'),
    ])
        if (existsSync(candidate) && statSync(candidate).isFile())
            return candidate;
    return undefined;
};

const reach = (entries: string[]): Set<string> => {
    const seen = new Set<string>();
    const todo = [...entries];
    while (todo.length) {
        const file = todo.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        for (const spec of importsOf(file)) {
            // lazy page imports still count: they are part of the module graph
            const target = resolveImport(file, spec);
            if (target && isCode(target)) todo.push(target);
        }
    }
    return seen;
};

describe('QBS-050 the admin page and share viewer use no editor module', () => {
    const forbidden = [
        'qbase/diagram-provider',
        'qbase/storage-provider',
        'qbase/use-diagram',
        'qbase/editor-api',
        'canvas/',
        'store/editor-',
        'workspace/',
    ];
    const check = (dir: string) => {
        const entries = walk(join(ROOT, dir)).filter(isCode);
        const files = [...reach(entries)].map((f) => relative(ROOT, f));
        const hits = files.filter((f) => forbidden.some((x) => f.includes(x)));
        expect(hits).toEqual([]);
    };

    it('admin page', () => check('pages/admin-page'));
    it('share viewer page', () => check('pages/share-viewer-page'));

    it('the home page may use storage but no diagram or canvas', () => {
        const entries = walk(join(ROOT, 'pages/home-page')).filter(isCode);
        const files = [...reach(entries)].map((f) => relative(ROOT, f));
        expect(
            files.filter((f) =>
                [
                    'qbase/diagram-provider',
                    'qbase/use-diagram',
                    'canvas/',
                    'workspace/',
                ].some((x) => f.includes(x))
            )
        ).toEqual([]);
    });
});

describe('QBS-051 the server needs only the metadata type file and shared/', () => {
    const serverFiles = walk(join(REPO, 'server/src')).filter((f) =>
        /\.ts$/.test(f)
    );
    it('every import that leaves server/ points into shared/ or at the metadata type file', () => {
        const outside: string[] = [];
        for (const file of serverFiles)
            for (const spec of importsOf(file)) {
                if (!spec.startsWith('.')) continue;
                const target = resolve(
                    dirname(file),
                    spec.replace(/\.js$/, '')
                );
                if (target.startsWith(join(REPO, 'server'))) continue;
                const ok =
                    target.startsWith(join(REPO, 'shared')) ||
                    target ===
                        join(
                            REPO,
                            'src/lib/data/import-metadata/metadata-types/database-metadata'
                        );
                if (!ok) outside.push(`${relative(REPO, file)} -> ${spec}`);
            }
        expect(outside).toEqual([]);
    });

    it('shared/ imports nothing from the editor', () => {
        for (const file of walk(join(REPO, 'shared')).filter(
            (f) => f.endsWith('.ts') && !f.includes('__tests__')
        ))
            for (const spec of importsOf(file))
                expect(spec, file).not.toMatch(/^@\/|\.\.\/src\//);
    });

    it('the metadata type file needs only zod, and the Docker build copies it and shared/', () => {
        expect(
            importsOf(
                join(
                    ROOT,
                    'lib/data/import-metadata/metadata-types/database-metadata.ts'
                )
            )
        ).toEqual(['zod']);
        const docker = readFileSync(join(REPO, 'Dockerfile'), 'utf8');
        expect(docker).toMatch(/COPY shared\//);
        expect(docker).toMatch(
            /COPY src\/lib\/data\/import-metadata\/metadata-types\//
        );
    });
});

describe('QBS-016 the metadata type and schema stay at their fixed path', () => {
    it('accepts the six collections the server sends and refuses a missing one', () => {
        const ok = {
            database_name: 'd',
            version: '1',
            tables: [],
            views: [],
            columns: [],
            pk_info: [],
            fk_info: [],
            indexes: [],
        };
        expect(DatabaseMetadata.safeParse(ok).success).toBe(true);
        const { columns: _drop, ...broken } = ok;
        void _drop;
        expect(DatabaseMetadata.safeParse(broken).success).toBe(false);
    });
});

describe('QBS-014 the UI primitives QBase files use exist with the names they import', () => {
    const qbaseDirs = [
        'components/qubdi',
        'pages/admin-page',
        'pages/share-viewer-page',
        'pages/home-page',
        'lib/qubdi',
    ];
    const wanted = new Map<string, Set<string>>();
    for (const dir of qbaseDirs)
        for (const file of walk(join(ROOT, dir)).filter(isCode)) {
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(
                /import\s*\{([^}]*)\}\s*from\s*'@\/platform\/ui\/([\w-]+)'/g
            )) {
                const set = wanted.get(m[2]) ?? new Set<string>();
                for (const part of m[1].split(','))
                    if (part.trim())
                        set.add(
                            part
                                .trim()
                                .split(/\s+as\s+/)[0]
                                .replace(/^type\s+/, '')
                        );
                wanted.set(m[2], set);
            }
        }

    it('covers the twelve primitives the contract lists', () => {
        for (const name of [
            'button',
            'input',
            'dialog',
            'alert-dialog',
            'dropdown-menu',
            'popover',
            'table',
            'tabs',
            'checkbox',
            'label',
            'badge',
            'spinner',
        ])
            expect(
                existsSync(join(ROOT, 'platform/ui', `${name}.tsx`)),
                name
            ).toBe(true);
    });

    it('every imported name is exported by its module', async () => {
        const missing: string[] = [];
        for (const [module, names] of wanted) {
            const loaded = await uiModules[`../platform/ui/${module}.tsx`]();
            for (const n of names)
                if (!(n in loaded) && !/^[A-Z]\w*Props$/.test(n))
                    missing.push(`${module}:${n}`);
        }
        expect(missing).toEqual([]);
    });
});

describe('QBS-019 the kept SQL test folders and the export helper exist (the old module names are not provided)', () => {
    it('the test folders and the exportBaseSQL helper exist', async () => {
        const { exportBaseSQL } =
            await import('@/lib/data/sql-export/__tests__/builders');
        expect(exportBaseSQL).toBeTypeOf('function');
        for (const dir of ['lib/data/sql-export', 'lib/data/sql-import'])
            expect(existsSync(join(ROOT, dir, '__tests__'))).toBe(true);
    });
});

describe('QBS-020 i18n works outside React and locale files keep their shape', () => {
    it('t() gives English text with no component, and the language list is exported', async () => {
        const { i18nReady } = await import('@/i18n/i18n');
        await i18nReady;
        expect(i18n.t('menu.actions.save')).toBe('Save');
        expect(languages.length).toBeGreaterThan(1);
    });

    it('each locale file exports one object named by its code, shaped as a translation object', async () => {
        const files = readdirSync(join(ROOT, 'i18n/locales')).filter((f) =>
            f.endsWith('.ts')
        );
        expect(files.length).toBe(7);
        for (const file of files) {
            const code = file.replace(/\.ts$/, '');
            const mod = await localeModules[`../i18n/locales/${code}.ts`]();
            expect(Object.keys(mod), file).toEqual([code]);
            expect(mod[code], file).toHaveProperty('translation');
        }
    });

    it('English merges the six qubdi files under the qubdi key', async () => {
        const { en } = await import('@/i18n/locales/en');
        expect(Object.keys(en.translation.qubdi).sort()).toEqual(
            [
                'account',
                'adminProjects',
                'adminUsers',
                'database',
                'sidePanel',
                'workspace',
            ].sort()
        );
        expect(
            readdirSync(join(ROOT, 'i18n/qubdi')).filter((f) =>
                f.endsWith('.ts')
            )
        ).toHaveLength(6);
    });
});
