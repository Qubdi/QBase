import type { Diagnostic, ScriptResult } from '../script-model';
import type { ReaderProfile } from './profile';
import { readStatements } from './read-script';
import { blankCopyData } from './statements';
import { validateText } from './validate';
import type { ValidationRules } from './validate';

/** A reader: validate the raw text, then read it, one result with all messages. */
export function makeReader(
    profile: ReaderProfile,
    rules: ValidationRules
): (text: string) => ScriptResult {
    return (text) => {
        // COPY data rows are not SQL (an apostrophe in one is just text), so
        // the checks see them blanked, as the reader does
        const checked = profile.lex.dollarStrings ? blankCopyData(text) : text;
        const checks = validateText(checked, profile.lex, rules);
        const blocked = checks.some((d) => d.severity === 'error');
        const empty: ScriptResult = {
            tables: [],
            indexes: [],
            foreignKeys: [],
            enums: [],
            diagnostics: [],
        };
        const read = blocked ? empty : readStatements(text, profile);
        const diagnostics: Diagnostic[] = [...checks];
        for (const d of read.diagnostics) {
            if (d.severity === 'error') diagnostics.unshift(d);
            else diagnostics.push(d);
        }
        return { ...read, diagnostics };
    };
}
