import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/locales/en';

type Tree = { [key: string]: string | Tree };

const files = import.meta.glob<Record<string, { translation: Tree }>>([
    '../locales/*.ts',
    '!../locales/en.ts',
]);

const PLURAL = /_(zero|one|two|few|many|other)$/;

/** Flattens a tree to `path -> text`. */
const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
    Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
        if (typeof value === 'string') all[`${prefix}${key}`] = value;
        else Object.assign(all, flatten(value, `${prefix}${key}.`));
        return all;
    }, {});

/** Groups plural forms of one message under the same base key. */
const grouped = (flat: Record<string, string>) => {
    const groups = new Map<string, string[]>();
    for (const [path, text] of Object.entries(flat)) {
        const base = path.replace(PLURAL, '');
        groups.set(base, [...(groups.get(base) ?? []), text]);
    }
    return groups;
};

const placeholders = (texts: string[]) =>
    [
        ...new Set(texts.flatMap((t) => t.match(/\{\{\s*\w+\s*\}\}/g) ?? [])),
    ].sort();

const english = grouped(flatten(en.translation as Tree));

describe('translated languages (SHL-098)', () => {
    for (const [file, load] of Object.entries(files)) {
        const code = file.replace(/^.*\//, '').replace(/\.ts$/, '');
        it(`${code} is either empty or complete and keeps placeholders`, async () => {
            const translation = (await load())[code].translation;
            const flat = flatten(translation);
            if (Object.keys(flat).length === 0) return; // falls back to English
            const mine = grouped(flat);
            const missing = [...english.keys()].filter((k) => !mine.has(k));
            expect(missing, `missing in ${code}`).toEqual([]);
            const extra = [...mine.keys()].filter((k) => !english.has(k));
            expect(extra, `unknown keys in ${code}`).toEqual([]);
            const broken = [...english.entries()]
                .filter(
                    ([key, texts]) =>
                        placeholders(texts).join() !==
                        placeholders(mine.get(key) ?? []).join()
                )
                .map(([key]) => key);
            expect(broken, `placeholders differ in ${code}`).toEqual([]);
        });
    }
});
