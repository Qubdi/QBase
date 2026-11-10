// QBase schema lint for CI:
//   npx tsx src/cli/lint.ts diagram.json [--config lint.json] [--format text|json]
//                           [--fail-on error|warning|info|never] [--database-type postgresql]
// Exit codes: 0 = nothing at or above --fail-on, 1 = findings, 2 = bad usage or unreadable input.
import { readFileSync } from 'node:fs';
import {
    exceeds,
    formatFinding,
    lint,
    normalizeConfig,
    summarizeFindings,
    type LintInput,
    type LintSeverity,
} from '../../../shared/lint.js';

export interface CliIo {
    readFile: (path: string) => string;
    out: (text: string) => void;
    err: (text: string) => void;
}

const USAGE = `Usage: lint <diagram.json> [options]

  --config <file>         lint settings (rules, severities, naming) as JSON
  --format text|json      output format (default text)
  --fail-on <level>       error | warning | info | never (default error)
  --database-type <type>  override the diagram's database type
`;

interface Args {
    file?: string;
    config?: string;
    format: 'text' | 'json';
    failOn: LintSeverity | 'never';
    databaseType?: string;
    help: boolean;
}

export function parseArgs(argv: string[]): Args | { error: string } {
    const args: Args = { format: 'text', failOn: 'error', help: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const value = () => {
            const v = argv[++i];
            if (v === undefined) throw new Error(`${a} needs a value`);
            return v;
        };
        try {
            if (a === '--help' || a === '-h') args.help = true;
            else if (a === '--config') args.config = value();
            else if (a === '--format') {
                const v = value();
                if (v !== 'text' && v !== 'json') throw new Error('--format must be text or json');
                args.format = v;
            } else if (a === '--fail-on') {
                const v = value();
                if (!['error', 'warning', 'info', 'never'].includes(v)) {
                    throw new Error('--fail-on must be error, warning, info or never');
                }
                args.failOn = v as Args['failOn'];
            } else if (a === '--database-type') args.databaseType = value();
            else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
            else if (args.file === undefined) args.file = a;
            else throw new Error('only one diagram file is accepted');
        } catch (e) {
            return { error: (e as Error).message };
        }
    }
    return args;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** Throws, naming the table, when the lint would hit a table or column shape it cannot read. */
function checkShape(diagram: Record<string, unknown>): void {
    (diagram.tables as unknown[]).forEach((t, i) => {
        if (!isObject(t)) throw new Error(`tables[${i}] is not an object`);
        const where = `table ${typeof t.name === 'string' ? `"${t.name}"` : `#${i}`}`;
        if (!Array.isArray(t.fields)) throw new Error(`${where} has no "fields" array`);
        t.fields.forEach((f, j) => {
            if (!isObject(f) || !isObject(f.type)) {
                throw new Error(`${where}: fields[${j}] needs an object "type"`);
            }
            if (typeof f.name !== 'string') {
                throw new Error(`${where}: fields[${j}] needs a text "name"`);
            }
        });
        if (t.indexes !== undefined && !Array.isArray(t.indexes)) {
            throw new Error(`${where}: "indexes" is not an array`);
        }
        (t.indexes as unknown[] | undefined)?.forEach((x, j) => {
            if (!isObject(x) || !Array.isArray(x.fieldIds)) {
                throw new Error(`${where}: indexes[${j}] needs a "fieldIds" array`);
            }
        });
    });
    if (diagram.relationships !== undefined && !Array.isArray(diagram.relationships)) {
        throw new Error('"relationships" is not an array');
    }
}

/** A QBase export, or the server's { title, content } wrapper. */
function diagramOf(json: unknown): LintInput {
    if (json && typeof json === 'object') {
        const o = json as Record<string, unknown>;
        const diagram = Array.isArray(o.tables)
            ? o
            : isObject(o.content) && Array.isArray(o.content.tables)
              ? o.content
              : undefined;
        if (diagram) {
            checkShape(diagram);
            return diagram as LintInput;
        }
    }
    throw new Error('the file does not look like a QBase diagram (no "tables")');
}

export function runCli(argv: string[], io: CliIo): number {
    const args = parseArgs(argv);
    if ('error' in args) {
        io.err(`${args.error}\n${USAGE}`);
        return 2;
    }
    if (args.help) {
        io.out(USAGE);
        return 0;
    }
    if (!args.file) {
        io.err(`missing diagram file\n${USAGE}`);
        return 2;
    }

    let diagram: LintInput;
    let config = {};
    try {
        diagram = diagramOf(JSON.parse(io.readFile(args.file)));
        if (args.config) config = normalizeConfig(JSON.parse(io.readFile(args.config)));
    } catch (e) {
        io.err(`cannot read input: ${(e as Error).message}\n`);
        return 2;
    }
    if (args.databaseType) diagram = { ...diagram, databaseType: args.databaseType };

    let findings: ReturnType<typeof lint>;
    try {
        findings = lint(diagram, config);
    } catch (e) {
        // exit 1 means "findings"; a diagram the linter cannot read is an input fault
        io.err(`cannot lint this diagram: ${(e as Error).message}\n`);
        return 2;
    }
    const summary = summarizeFindings(findings);
    if (args.format === 'json') {
        io.out(`${JSON.stringify({ findings, summary }, null, 2)}\n`);
    } else if (findings.length === 0) {
        io.out('No problems found.\n');
    } else {
        io.out(
            `${findings.map(formatFinding).join('\n')}\n\n` +
                `${summary.total} problem(s): ${summary.error} error, ${summary.warning} warning, ${summary.info} info\n`
        );
    }
    return args.failOn !== 'never' && exceeds(findings, args.failOn) ? 1 : 0;
}

// run only when started directly, not when imported by tests
const entry = process.argv[1] ?? '';
if (/cli[\\/]lint\.(ts|js)$/.test(entry)) {
    process.exitCode = runCli(process.argv.slice(2), {
        readFile: (p) => readFileSync(p, 'utf8'),
        out: (t) => process.stdout.write(t),
        err: (t) => process.stderr.write(t),
    });
}
