import type { Diagnostic } from '../script-model';
import type { LexProfile } from './tokenizer';

/** What differs between the SQL families when a script is read. */
export interface ReaderProfile {
    lex: LexProfile;
    /** a line holding only GO ends a batch */
    goBatches: boolean;
    /** `type[]` is a valid column type */
    arrayTypes: boolean;
    /** a column definition may not carry REFERENCES (MySQL ignores it) */
    inlineReferencesAreErrors: boolean;
    /** type names folded to one spelling (source spelling to kept spelling) */
    typeSynonyms: Readonly<Record<string, string>>;
    /** skipped statement kinds are reported one by one rather than counted */
    detailedSkips: boolean;
    /** statements the reader refuses outright, with their error */
    forbidden?: (words: string[], line: number) => Diagnostic | undefined;
    /** type given to a view column whose type cannot be known */
    viewColumnType: string;
}
