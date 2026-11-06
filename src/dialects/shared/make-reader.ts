import type { Diagnostic, ScriptResult } from '../script-model';
import type { ReaderProfile } from './profile';
import { readStatements } from './read-script';
import { validateText } from './validate';
import type { ValidationRules } from './validate';

/** A reader: validate the raw text, then read it, one result with all messages. */
export function makeReader(
    profile: ReaderProfile,
    rules: ValidationRules
): (text: string) => ScriptResult {
    return (text) => {
        const checks = validateText(text, profile.lex, rules);
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
