import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Fails when a component carries user-visible English that bypasses i18n:
// JSX text, text-bearing attributes, and toast / dialog title and description
// literals. Add to ALLOWED only for text that is not meant to be translated
// (brand names, code samples, file formats), with a reason.

/** Attributes whose string value is shown to, or announced to, people. */
const TEXT_ATTRIBUTES = new Set([
    'aria-label',
    'aria-description',
    'aria-placeholder',
    'title',
    'placeholder',
    'alt',
    'label',
]);
/** Object properties that carry toast / dialog wording. */
const TEXT_PROPERTIES = new Set(['title', 'description', 'message']);

/** The code that draws or talks to people. The engines (core, dialects,
 * formats) write English for tests and tools; `lib/diagnostic-text.ts` shows it. */
const SCANNED = [
    'src/components',
    'src/features',
    'src/workspace',
    'src/canvas',
    'src/pages',
    'src/platform',
    'src/qbase',
    'src/dialogs',
    'src/context',
    'src/helmet',
    'src/store',
    'src/hooks',
    'src/lib/qubdi',
    'src/persistence',
];

/** Product and brand names are the same in every language. */
const NAMES = new Set([
    'QBase',
    'Base',
    'Qubdi',
    'Qubd',
    'SQL Server',
    'PostgreSQL',
    'MySQL',
    'MariaDB',
    'SQLite',
    'DBML',
]);

/** Other text allowed on purpose, keyed by `path: text`, with the reason. */
const ALLOWED = new Set<string>([
    // an engine refusal; `diagnosticText` shows it in the current language
    'src/store/editor-store.ts: This diagram cannot be edited',
]);

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory())
            return name === '__tests__' || name === 'test' ? [] : walk(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
            ? [path]
            : [];
    });

/** A run of letters that reads as a word, such as "Use" or "Your colors". */
const looksLikeEnglish = (text: string): boolean =>
    /[A-Za-z]{2,}/.test(text.replace(/\$\{[^}]*\}/g, ''));

export const findHardCodedText = (file: string): string[] => {
    const source = readFileSync(file, 'utf8');
    const tsx = file.endsWith('.tsx');
    const sf = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const found: string[] = [];
    const report = (node: ts.Node, text: string) => {
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!NAMES.has(clean) && !ALLOWED.has(`${file}: ${clean}`))
            found.push(`${file}:${line}: ${clean}`);
    };
    const literalText = (node: ts.Node): string | null => {
        if (
            ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node)
        )
            return node.text;
        if (ts.isTemplateExpression(node))
            return [
                node.head.text,
                ...node.templateSpans.map((s) => s.literal.text),
            ].join('${}');
        return null;
    };
    const visit = (node: ts.Node) => {
        if (ts.isJsxText(node)) {
            const text = node.text.trim();
            if (text && looksLikeEnglish(text)) report(node, text);
        } else if (ts.isJsxAttribute(node) && node.initializer) {
            const name = node.name.getText(sf);
            if (TEXT_ATTRIBUTES.has(name)) {
                const init = ts.isJsxExpression(node.initializer)
                    ? node.initializer.expression
                    : node.initializer;
                const text = init ? literalText(init) : null;
                if (text !== null && looksLikeEnglish(text)) report(node, text);
            }
        } else if (ts.isJsxExpression(node) && node.expression) {
            // {'Some text'} inside an element
            const parent = node.parent;
            if (ts.isJsxElement(parent) || ts.isJsxFragment(parent)) {
                const text = literalText(node.expression);
                if (text !== null && looksLikeEnglish(text)) report(node, text);
            }
        } else if (ts.isPropertyAssignment(node)) {
            const name = node.name.getText(sf);
            if (TEXT_PROPERTIES.has(name)) {
                const text = literalText(node.initializer);
                // A sentence has a space; one bare word is usually a code value.
                if (text !== null && /[A-Za-z]{2,}\s+\S/.test(text))
                    report(node, text);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
};

describe('hard-coded text', () => {
    it('keeps user-visible English out of components', () => {
        const found = SCANNED.flatMap(walk).flatMap(findHardCodedText);
        expect(found).toEqual([]);
    });
});
