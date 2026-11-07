// English text for creating, opening, renaming, duplicating, clearing and
// deleting diagrams in the browser's own storage.
export const designsStrings = {
    defaultName: 'Diagram {{number}}',
    create: {
        titleType: 'Which database is this for?',
        descriptionType:
            'The choice stays with the diagram. Pick one to carry on.',
        titleImport: 'Start from existing work',
        descriptionImport:
            'Paste a schema to build the diagram from it, or begin with a blank one.',
        fromFile: 'Open a saved file',
        empty: 'Blank diagram',
        emptyFromImport: 'Blank diagram instead',
        import: 'Build from text',
        failed: 'The diagram could not be created. Please try again.',
    },
    open: {
        title: 'Your diagrams',
        description:
            'Everything stored in this browser, most recently changed first.',
        search: 'Search by name',
        empty: 'No diagrams are stored here yet.',
        noMatch: 'No diagram has that name.',
        columns: {
            name: 'Name',
            created: 'Created',
            changed: 'Changed',
            tables: 'Tables',
            actions: 'Actions',
        },
        actionsFor: 'Actions for {{name}}',
        rowOpen: 'Open',
        rowRename: 'Rename',
        rowDuplicate: 'Make a copy',
        rowDelete: 'Delete',
        newDatabase: 'New diagram',
        open: 'Open diagram',
        copySuffix: '(Copy)',
        duplicated: 'Created {{name}}',
    },
    rename: {
        title: 'Rename diagram',
        description:
            'Choose a new name. Leave it blank to keep the current one.',
        label: 'Diagram name',
        save: 'Rename',
    },
    delete: {
        title: 'Delete this diagram?',
        description:
            '"{{name}}" will be removed for good. This cannot be undone.',
        confirm: 'Delete',
        failed: 'The diagram could not be deleted',
    },
    clear: {
        title: 'Empty the diagram?',
        description:
            'Every table, relationship and note will be removed and the history will be lost. The diagram itself stays. This cannot be undone.',
        confirm: 'Empty it',
        failed: 'The diagram could not be emptied',
    },
};
