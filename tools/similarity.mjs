#!/usr/bin/env node
// Measures how much of this repository's code is shared with an upstream checkout
// (ChartDB), for the clean-room rewrite described in REWRITE-PLAN.md.
//
// How it works
//   1. Every text file in the upstream source folder is turned into a list of
//      normalised lines (whitespace collapsed, blank lines and lines of three
//      characters or fewer dropped, line endings ignored).
//   2. Every run of SHINGLE consecutive lines is hashed. This is the upstream index.
//   3. Each file of ours is split the same way. A line counts as "shared" when it
//      is part of a run that also exists anywhere in the upstream index, so a
//      copied file is found even if it was moved or renamed.
//
// Usage
//   node tools/similarity.mjs --upstream <chartdb checkout> [options]
//
// Options
//   --upstream <dir>     ChartDB repository root (its src/ is indexed) or a src folder
//   --src <dir>          folder to measure; repeatable (default: src)
//   --csv <file>         write the per-file inventory to this CSV file
//   --threshold <pct>    shared-lines percentage that counts as derived (default 30)
//   --max-run <lines>    longest allowed run of shared lines (default 25)
//   --check              exit 1 when a checked file is over either limit
//   --base <git ref>     with --check: only check files added since this ref
//   --rewritten <file>   with --check: also check every path listed in this file
//   --shingle <n>        run length used for matching (default 4)
//
// Status values in the CSV
//   identical  same path as upstream and the same normalised content
//   derived    shared lines at or above the threshold
//   modified   shared lines between 10% and the threshold
//   ours       below 10% shared

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TEXT_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.css',
    '.json',
    '.html',
    '.md',
    '.svg',
    '.txt',
    '.sql',
    '.dbml',
    '.yaml',
    '.yml',
]);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);

function parseArguments(argv) {
    const options = {
        upstream: null,
        src: [],
        csv: null,
        threshold: 30,
        maxRun: 25,
        check: false,
        base: null,
        rewritten: null,
        shingle: 4,
    };
    for (let index = 0; index < argv.length; index++) {
        const flag = argv[index];
        const value = () => {
            const next = argv[++index];
            if (next === undefined) throw new Error(`${flag} needs a value`);
            return next;
        };
        switch (flag) {
            case '--upstream':
                options.upstream = value();
                break;
            case '--src':
                options.src.push(value());
                break;
            case '--csv':
                options.csv = value();
                break;
            case '--threshold':
                options.threshold = Number(value());
                break;
            case '--max-run':
                options.maxRun = Number(value());
                break;
            case '--check':
                options.check = true;
                break;
            case '--base':
                options.base = value();
                break;
            case '--rewritten':
                options.rewritten = value();
                break;
            case '--shingle':
                options.shingle = Number(value());
                break;
            default:
                throw new Error(`Unknown option ${flag}`);
        }
    }
    if (!options.upstream) throw new Error('--upstream is required');
    if (options.src.length === 0) options.src.push('src');
    return options;
}

function listFiles(directory) {
    const found = [];
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (!SKIP_DIRECTORIES.has(entry.name)) {
                    walk(path.join(current, entry.name));
                }
            } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
                found.push(path.join(current, entry.name));
            }
        }
    };
    walk(directory);
    return found;
}

function normalisedLines(file) {
    return fs
        .readFileSync(file, 'utf8')
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 3);
}

function shingles(lines, size) {
    const result = [];
    for (let start = 0; start + size <= lines.length; start++) {
        result.push(lines.slice(start, start + size).join('\n'));
    }
    return result;
}

function toPosix(file) {
    return file.split(path.sep).join('/');
}

function upstreamSourceDirectory(upstream) {
    const nested = path.join(upstream, 'src');
    return fs.existsSync(nested) ? nested : upstream;
}

function buildUpstreamIndex(upstream, size) {
    const root = upstreamSourceDirectory(upstream);
    const index = new Set();
    const contentByPath = new Map();
    for (const file of listFiles(root)) {
        const lines = normalisedLines(file);
        contentByPath.set(toPosix(path.relative(root, file)), lines.join('\n'));
        for (const shingle of shingles(lines, size)) index.add(shingle);
    }
    return { index, contentByPath, fileCount: contentByPath.size };
}

function measure(file, upstream, size, sourceRoot) {
    const lines = normalisedLines(file);
    const covered = new Array(lines.length).fill(false);
    shingles(lines, size).forEach((shingle, start) => {
        if (upstream.index.has(shingle)) {
            for (let offset = 0; offset < size; offset++) {
                covered[start + offset] = true;
            }
        }
    });
    let shared = 0;
    let longestRun = 0;
    let run = 0;
    for (const isCovered of covered) {
        if (isCovered) {
            shared++;
            run++;
            longestRun = Math.max(longestRun, run);
        } else {
            run = 0;
        }
    }
    const relativeToSource = toPosix(path.relative(sourceRoot, file));
    const upstreamContent = upstream.contentByPath.get(relativeToSource);
    const identical =
        upstreamContent !== undefined && upstreamContent === lines.join('\n');
    return {
        file: toPosix(path.relative(process.cwd(), file)),
        lines: lines.length,
        shared,
        percent: lines.length === 0 ? 0 : (100 * shared) / lines.length,
        longestRun,
        samePath: upstreamContent !== undefined,
        identical,
    };
}

function statusOf(result, threshold) {
    if (result.identical) return 'identical';
    if (result.percent >= threshold) return 'derived';
    if (result.percent >= 10) return 'modified';
    return 'ours';
}

function git(...args) {
    return execFileSync('git', args, { encoding: 'utf8' });
}

function addedFiles(base) {
    return git('diff', '--name-only', '--diff-filter=A', `${base}...HEAD`)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function csvEscape(value) {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function writeCsv(file, rows) {
    const header = [
        'path',
        'lines',
        'shared_lines',
        'shared_percent',
        'longest_shared_run',
        'same_path_upstream',
        'status',
    ];
    const body = rows.map((row) =>
        [
            csvEscape(row.file),
            row.lines,
            row.shared,
            row.percent.toFixed(1),
            row.longestRun,
            row.samePath ? 'yes' : 'no',
            row.status,
        ].join(',')
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, [header.join(','), ...body].join('\n') + '\n');
}

function printSummary(rows) {
    const totals = new Map();
    for (const row of rows) {
        const entry = totals.get(row.status) ?? { files: 0, lines: 0 };
        entry.files++;
        entry.lines += row.lines;
        totals.set(row.status, entry);
    }
    const allLines = rows.reduce((sum, row) => sum + row.lines, 0);
    console.log('\nstatus      files      lines   share of lines');
    for (const status of ['identical', 'derived', 'modified', 'ours']) {
        const entry = totals.get(status) ?? { files: 0, lines: 0 };
        const share = allLines === 0 ? 0 : (100 * entry.lines) / allLines;
        console.log(
            `${status.padEnd(10)} ${String(entry.files).padStart(6)} ${String(
                entry.lines
            ).padStart(10)}   ${share.toFixed(1).padStart(6)}%`
        );
    }
    console.log(
        `total      ${String(rows.length).padStart(6)} ${String(allLines).padStart(10)}`
    );
}

function main() {
    const options = parseArguments(process.argv.slice(2));
    const upstream = buildUpstreamIndex(options.upstream, options.shingle);
    console.log(
        `Indexed ${upstream.fileCount} upstream files (${upstream.index.size} runs of ${options.shingle} lines)`
    );

    const upstreamRoot = upstreamSourceDirectory(options.upstream);
    const rows = [];
    for (const source of options.src) {
        if (!fs.existsSync(source)) {
            console.warn(`Skipping ${source}: not found`);
            continue;
        }
        // Files are matched against upstream files by their path inside the source folder.
        for (const file of listFiles(source)) {
            const result = measure(file, upstream, options.shingle, source);
            result.status = statusOf(result, options.threshold);
            rows.push(result);
        }
    }
    rows.sort((a, b) => a.file.localeCompare(b.file));
    console.log(`Measured ${rows.length} files against ${upstreamRoot}`);
    printSummary(rows);

    if (options.csv) {
        writeCsv(options.csv, rows);
        console.log(`\nWrote ${options.csv}`);
    }

    if (!options.check) return;

    const toCheck = new Set();
    if (options.base)
        for (const file of addedFiles(options.base)) toCheck.add(file);
    if (options.rewritten && fs.existsSync(options.rewritten)) {
        for (const line of fs
            .readFileSync(options.rewritten, 'utf8')
            .split('\n')) {
            const entry = line.trim();
            if (entry && !entry.startsWith('#')) toCheck.add(entry);
        }
    }
    const failures = rows.filter(
        (row) =>
            toCheck.has(row.file) &&
            (row.percent >= options.threshold ||
                row.longestRun > options.maxRun)
    );
    console.log(`\nChecked ${toCheck.size} listed or added paths`);
    if (failures.length === 0) {
        console.log('No checked file is over the limits.');
        return;
    }
    console.error('\nToo much shared code with upstream:');
    for (const row of failures) {
        console.error(
            `  ${row.file}  ${row.percent.toFixed(1)}% shared, longest run ${row.longestRun} lines`
        );
    }
    process.exitCode = 1;
}

main();
