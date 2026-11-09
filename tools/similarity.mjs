#!/usr/bin/env node
// Measures how much of this repository's code is shared with an upstream checkout
// (ChartDB), for the clean-room rewrite described in rewrite/PLAN.md.
//
// How it works
//   1. Every text file in the upstream repository is turned into a list of
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
//   --upstream <dir>     ChartDB repository root (the whole repository is indexed)
//   --src <path>         folder or single file to measure; repeatable (default: src)
//   --tracked            measure every git-tracked text file instead of --src
//   --exclude <prefix>   with --tracked: skip paths starting with this; repeatable
//   --csv <file>         write the per-file inventory to this CSV file
//   --threshold <pct>    shared-lines percentage that counts as derived (default 30)
//   --max-run <lines>    longest allowed run of shared lines (default 25)
//   --check              exit 1 when a checked file is over a limit or identical
//   --all                with --check: check every measured file
//   --base <git ref>     with --check: also check files added since this ref
//   --rewritten <file>   with --check: also check every path listed in this file
//                        (any tracked path; measured on demand)
//   --allow <file>       with --check: paths accepted even if identical to upstream
//                        (tiny generic config files); one path per line, # = comment
//   --shingle <n>        run length used for matching (default 4)
//
// Limits: it finds copied and lightly edited text. It does not find code that was
// translated, restructured or reimplemented from reading the original, and it does
// not look at binary files. See "Limits of the similarity check" in rewrite/PLAN.md.
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
    '.sh',
    '.toml',
]);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);

function parseArguments(argv) {
    const options = {
        upstream: null,
        src: [],
        tracked: false,
        exclude: [],
        all: false,
        allow: null,
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
            case '--tracked':
                options.tracked = true;
                break;
            case '--exclude':
                options.exclude.push(value());
                break;
            case '--all':
                options.all = true;
                break;
            case '--allow':
                options.allow = value();
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
    if (options.src.length === 0 && !options.tracked) options.src.push('src');
    return options;
}

const SKIP_FILES = new Set(['package-lock.json']);
// Text files without a useful extension.
const TEXT_NAMES = new Set([
    'Dockerfile',
    '.dockerignore',
    '.gitignore',
    '.gitattributes',
    '.nvmrc',
    '.prettierignore',
    '.editorconfig',
    'pre-commit',
]);

function isTextFile(file) {
    const name = path.basename(file);
    if (SKIP_FILES.has(name)) return false;
    return TEXT_EXTENSIONS.has(path.extname(name)) || TEXT_NAMES.has(name);
}

function listFiles(directory) {
    if (fs.statSync(directory).isFile()) {
        return isTextFile(directory) ? [directory] : [];
    }
    const found = [];
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (!SKIP_DIRECTORIES.has(entry.name)) {
                    walk(path.join(current, entry.name));
                }
            } else if (isTextFile(entry.name)) {
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

function buildUpstreamIndex(root, size) {
    const index = new Set();
    const contentByPath = new Map();
    for (const file of listFiles(root)) {
        const lines = normalisedLines(file);
        contentByPath.set(toPosix(path.relative(root, file)), lines.join('\n'));
        for (const shingle of shingles(lines, size)) index.add(shingle);
    }
    return { index, contentByPath, fileCount: contentByPath.size };
}

function measure(file, upstream, size) {
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
    // Same layout as upstream: src/x here is src/x there.
    const relativePath = toPosix(path.relative(process.cwd(), file));
    const upstreamContent = upstream.contentByPath.get(relativePath);
    const identical =
        upstreamContent !== undefined && upstreamContent === lines.join('\n');
    return {
        file: relativePath,
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

function trackedFiles(exclude) {
    return git('ls-files')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((file) => isTextFile(file))
        .filter((file) => !exclude.some((prefix) => file.startsWith(prefix)));
}

/** Ends the run with an error: a check that cannot do what was asked must not pass. */
function die(message) {
    console.error(`similarity: ${message}`);
    process.exit(2);
}

function readPathList(file, option) {
    if (!file) return [];
    if (!fs.existsSync(file)) die(`${option} file not found: ${file}`);
    return fs
        .readFileSync(file, 'utf8')
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
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

    const files = options.tracked
        ? trackedFiles(options.exclude)
        : options.src.flatMap((source) => {
              if (!fs.existsSync(source)) {
                  console.warn(`Skipping ${source}: not found`);
                  return [];
              }
              return listFiles(source);
          });
    const measureFile = (file) => {
        const result = measure(file, upstream, options.shingle);
        result.status = statusOf(result, options.threshold);
        return result;
    };
    const rows = files.map(measureFile);
    rows.sort((a, b) => a.file.localeCompare(b.file));
    console.log(`Measured ${rows.length} files against ${options.upstream}`);
    printSummary(rows);

    if (options.csv) {
        writeCsv(options.csv, rows);
        console.log(`\nWrote ${options.csv}`);
    }

    if (!options.check) return;

    const toCheck = new Set();
    if (options.all) for (const row of rows) toCheck.add(row.file);
    if (options.base)
        for (const file of addedFiles(options.base)) toCheck.add(file);
    const listed = readPathList(options.rewritten, '--rewritten');
    const gone = listed.filter((entry) => !fs.existsSync(entry));
    if (gone.length > 0)
        die(
            `--rewritten lists paths that do not exist:\n  ${gone.join('\n  ')}`
        );
    for (const entry of listed) toCheck.add(entry);

    // Listed paths that were not in the measured set are measured now.
    const measured = new Set(rows.map((row) => row.file));
    const checked = rows.filter((row) => toCheck.has(row.file));
    for (const entry of toCheck) {
        if (!measured.has(entry) && fs.existsSync(entry) && isTextFile(entry)) {
            checked.push(measureFile(entry));
        }
    }
    const allowed = new Set(readPathList(options.allow, '--allow'));
    const failures = checked.filter(
        (row) =>
            !allowed.has(row.file) &&
            (row.identical ||
                row.percent >= options.threshold ||
                row.longestRun > options.maxRun)
    );
    console.log(`\nChecked ${checked.length} files`);
    if (failures.length === 0) {
        console.log('No checked file is over the limits.');
        return;
    }
    console.error('\nToo much shared code with upstream:');
    for (const row of failures) {
        const detail = row.identical
            ? 'identical to upstream'
            : `${row.percent.toFixed(1)}% shared, longest run ${row.longestRun} lines`;
        console.error(`  ${row.file}  ${detail}`);
    }
    process.exitCode = 1;
}

main();
