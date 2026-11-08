// English text for creating, opening, renaming, duplicating, clearing and
// deleting diagrams in the browser's own storage.
export const designsStrings = {
    defaultName: 'Diagram {{number}}',
    create: {
        titleType: 'What is your Database?',
        descriptionType:
            'Each database has its own unique features and capabilities.',
        titleImport: 'Import your Database',
        descriptionImport:
            'Paste a schema to build the diagram from it, or begin with a blank one.',
        fromFile: 'Import from File',
        empty: 'Empty database',
        tabTransactional: 'Transactional',
        tabAnalytical: 'Analytical',
        moreDatabases: 'More Databases',
        primaryDatabases: 'Primary Databases',
        checkExamples: 'Check Examples',
        titleExamples: 'Examples',
        descriptionExamples:
            'Start from a small diagram made for one database. Pick one to open it as a new diagram.',
        genericOption: 'Use a generic database instead',
        emptyFromImport: 'Empty database',
        import: 'Import',
        failed: 'The diagram could not be created. Please try again.',
    },
    examplesSize: '{{tables}} tables · {{areas}} areas',
    examples: {
        clinic: 'Patients, doctors and specialties, with appointments and the medicines prescribed at them.',
        bookshop:
            'Authors, categories and books, with customers, their orders and the items in each order.',
        library: 'Branches, members and lendable items, with loans and holds.',
        habits: 'People, their habits and daily check-ins, with reminders and tags.',
        hotel: 'Hotels, room types and rooms, with guests, reservations and payments.',
        airline:
            'Airports, aircraft and flights, with passengers, bookings and tickets.',
    },
    open: {
        title: 'Open Database',
        description: 'Select a diagram to open from the list below.',
        search: 'Search by name',
        empty: 'No diagrams are stored here yet.',
        noMatch: 'No diagram has that name.',
        columns: {
            name: 'Name',
            created: 'Created at',
            changed: 'Last modified',
            tables: 'Tables',
            actions: 'Actions',
        },
        actionsFor: 'Actions for {{name}}',
        rowOpen: 'Open',
        rowRename: 'Rename',
        rowDuplicate: 'Make a copy',
        rowDelete: 'Delete',
        newDatabase: 'New Database',
        open: 'Open',
        copySuffix: '(Copy)',
        duplicated: 'Created {{name}}',
    },
    rename: {
        title: 'Rename Diagram',
        description:
            'Choose a new name. Leave it blank to keep the current one.',
        label: 'Diagram name',
        save: 'Rename',
    },
    delete: {
        title: 'Delete Diagram',
        description:
            'This action cannot be undone. This will permanently delete the diagram.',
        confirm: 'Delete',
        failed: 'The diagram could not be deleted',
    },
    clear: {
        title: 'Clear Diagram',
        description:
            'This action cannot be undone. This will permanently delete all the data in the diagram.',
        confirm: 'Clear',
        failed: 'The diagram could not be emptied',
    },
};
