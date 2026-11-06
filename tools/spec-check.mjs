#!/usr/bin/env node
// Guard for the behaviour spec (rewrite/spec/*.md) of the clean-room rewrite, see
// rewrite/PLAN.md sections 6 and 9. The spec must describe behaviour in prose, tables
// and small data examples. It must not contain ChartDB code.
//
// It fails (exit 1) and prints file:line and the reason when it finds:
//   - a fenced code block in ts, tsx, js, jsx (also typescript, javascript);
//   - a line that looks like source: import ... from, export const/function/..,
//     => with braces, React hooks (useState, useEffect, ...), interface/type declarations;
//   - with --upstream, a run of 8 or more consecutive normalised lines that also
//     appears in the ChartDB checkout (same normalisation as tools/similarity.mjs:
//     whitespace collapsed, lines of three characters or fewer dropped).
// json, sql and text fences (and fences without a language) are allowed. Fences longer
// than 60 lines are reported as warnings and do not fail the check.
//
// Usage
//   node tools/spec-check.mjs [--dir <folder>] [--upstream <chartdb checkout>] [--run <n>]
//     --dir       folder with the spec files (default rewrite/spec); every *.md in it,
//                 subfolders included
//     --upstream  ChartDB repository root; enables the shared-lines check
//     --run       consecutive shared lines that fail (default 8)

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const FORBIDDEN_FENCES = new Set([
    'ts',
    'tsx',
    'js',
    'jsx',
    'typescript',
    'javascript',
    'mjs',
    'cjs',
]);
const PLAIN_FENCES = new Set(['', 'json', 'sql', 'text', 'txt', 'plain']);
const LONG_FENCE = 60;
const TEXT_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json', '.html',
    '.md', '.svg', '.txt', '.sql', '.dbml', '.yaml', '.yml', '.sh', '.toml',
]);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);

const SOURCE_PATTERNS = [
    [/^\s*import\s+[^;]*\bfrom\s+['"]/, 'import ... from'],
    [/^\s*import\s+['"][^'"]+['"]/, 'side-effect import'],
    [
        /^\s*export\s+(default\s+)?(async\s+)?(const|let|var|function|class|enum|interface|type|abstract)\b/,
        'export declaration',
    ],
    [/=>/, null], // handled below: only when braces are present
    [/\buse(State|Effect|Memo|Callback|Ref|Context|Reducer|LayoutEffect)\b/, 'React hook'],
    [
        /^\s*(export\s+)?(declare\s+)?interface\s+\w+\s*(<[^>]*>)?\s*(extends\b[^{]*)?\{?\s*$/,
        'interface declaration',
    ],
    [/^\s*(export\s+)?(declare\s+)?type\s+\w+\s*(<[^>]*>)?\s*=/, 'type declaration'],
];

function parseArguments(argv) {
    const options = { dir: 'rewrite/spec', upstream: null, run: 8 };
    for (let index = 0; index < argv.length; index++) {
        const flag = argv[index];
        const value = () => {
            const next = argv[++index];
            if (next === undefined) throw new Error(`${flag} needs a value`);
            return next;
        };
        if (flag === '--dir') options.dir = value();
        else if (flag === '--upstream') options.upstream = value();
        else if (flag === '--run') options.run = Number(value());
        else throw new Error(`Unknown option ${flag}`);
    }
    return options;
}

function walk(directory, accept) {
    const found = [];
    const visit = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRECTORIES.has(entry.name)) visit(full);
            } else if (accept(entry.name)) {
                found.push(full);
            }
        }
    };
    visit(directory);
    return found.sort();
}

// Same normalisation as tools/similarity.mjs, but remembers the original line number.
function normalised(text) {
    const result = [];
    text.replace(/\r/g, '')
        .split('\n')
        .forEach((line, index) => {
            const clean = line.replace(/\s+/g, ' ').trim();
            if (clean.length > 3) result.push({ text: clean, line: index + 1 });
        });
    return result;
}

function buildUpstreamIndex(root, size) {
    const index = new Set();
    const files = walk(root, (name) => {
        if (name === 'package-lock.json') return false;
        return TEXT_EXTENSIONS.has(path.extname(name));
    });
    for (const file of files) {
        const lines = normalised(fs.readFileSync(file, 'utf8')).map((l) => l.text);
        for (let start = 0; start + size <= lines.length; start++) {
            index.add(lines.slice(start, start + size).join('\n'));
        }
    }
    return { index, fileCount: files.length };
}

function checkStructure(file, text, problems, warnings) {
    let fence = null; // { marker, language, start }
    text.replace(/\r/g, '')
        .split('\n')
        .forEach((raw, offset) => {
            const lineNumber = offset + 1;
            const open = /^\s*(```+|~~~+)\s*([\w+-]*)/.exec(raw);
            if (fence) {
                if (open && open[1][0] === fence.marker[0] && open[1].length >= fence.marker.length && /^\s*(```+|~~~+)\s*$/.test(raw)) {
                    const length = lineNumber - fence.start - 1;
                    if (length > LONG_FENCE) {
                        warnings.push(
                            `${file}:${fence.start}  long ${fence.language || 'unlabelled'} fence (${length} lines, over ${LONG_FENCE})`
                        );
                    }
                    fence = null;
                }
                if (fence && PLAIN_FENCES.has(fence.language)) return;
            } else if (open) {
                const language = open[2].toLowerCase();
                fence = { marker: open[1], language, start: lineNumber };
                if (FORBIDDEN_FENCES.has(language)) {
                    problems.push(`${file}:${lineNumber}  code fence in language "${language}"`);
                }
                return;
            }
            // Fenced code of a forbidden language is already reported once for the fence.
            if (fence && FORBIDDEN_FENCES.has(fence.language)) return;
            for (const [pattern, reason] of SOURCE_PATTERNS) {
                if (!pattern.test(raw)) continue;
                if (reason === null) {
                    if (!/[{}]/.test(raw)) continue;
                    problems.push(`${file}:${lineNumber}  looks like source: arrow function with braces`);
                } else {
                    problems.push(`${file}:${lineNumber}  looks like source: ${reason}`);
                }
                break;
            }
        });
}

function checkUpstream(file, text, upstream, size, problems) {
    const lines = normalised(text);
    const covered = new Array(lines.length).fill(false);
    for (let start = 0; start + size <= lines.length; start++) {
        const key = lines
            .slice(start, start + size)
            .map((l) => l.text)
            .join('\n');
        if (upstream.index.has(key)) {
            for (let k = 0; k < size; k++) covered[start + k] = true;
        }
    }
    let start = -1;
    for (let i = 0; i <= lines.length; i++) {
        if (i < lines.length && covered[i]) {
            if (start < 0) start = i;
        } else if (start >= 0) {
            problems.push(
                `${file}:${lines[start].line}  ${i - start} consecutive lines (to line ${lines[i - 1].line}) shared with upstream`
            );
            start = -1;
        }
    }
}

function main() {
    const options = parseArguments(process.argv.slice(2));
    if (!fs.existsSync(options.dir)) {
        console.error(`spec-check: ${options.dir} not found`);
        process.exit(2);
    }
    const files = walk(options.dir, (name) => name.endsWith('.md'));
    const upstream = options.upstream
        ? buildUpstreamIndex(options.upstream, options.run)
        : null;
    if (upstream) {
        console.log(`Indexed ${upstream.fileCount} upstream files (runs of ${options.run} lines)`);
    }
    const problems = [];
    const warnings = [];
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        const relative = path.relative(process.cwd(), file);
        const shown = (relative.startsWith('..') ? file : relative)
            .split(path.sep)
            .join('/');
        checkStructure(shown, text, problems, warnings);
        if (upstream) checkUpstream(shown, text, upstream, options.run, problems);
    }
    console.log(`Checked ${files.length} spec files in ${options.dir}`);
    for (const warning of warnings) console.warn(`warning: ${warning}`);
    if (problems.length === 0) {
        console.log('No code found in the spec.');
        return;
    }
    console.error('\nThe spec must describe behaviour, not contain code:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
}

main();
