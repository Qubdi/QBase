/**
 * Type declarations for @dbml/parse
 *
 * The @dbml/parse package has types but they use path aliases (@/) that don't
 * resolve properly when consumed as a dependency. This module provides the
 * minimal types needed for the completion provider integration.
 */
declare module '@dbml/parse' {
    import type { languages, editor } from 'monaco-editor';

    /**
     * Path of a file inside a project layout
     */
    export class Filepath {
        static fromUri(uri: string): Filepath;
        get absolute(): string;
    }

    /**
     * Source store the compiler reads files from
     */
    export interface DbmlProjectLayout {
        getSource(filePath: Filepath): string | undefined;
    }

    /**
     * In-memory project layout holding DBML sources by file path
     */
    export class MemoryProjectLayout implements DbmlProjectLayout {
        constructor(files?: Map<string, string> | Record<string, string>);
        setSource(filePath: Filepath, content: string): void;
        getSource(filePath: Filepath): string | undefined;
    }

    /**
     * DBML Compiler - parses and analyzes DBML content
     */
    export class Compiler {
        constructor(layout: DbmlProjectLayout);
    }

    /**
     * Completion item provider for Monaco editor
     */
    export class DBMLCompletionItemProvider
        implements languages.CompletionItemProvider
    {
        triggerCharacters?: string[];
        constructor(
            compiler: Compiler,
            options?: { triggerCharacters?: string[] }
        );
        provideCompletionItems(
            model: editor.ITextModel,
            position: { lineNumber: number; column: number }
        ): languages.CompletionList;
    }
}
