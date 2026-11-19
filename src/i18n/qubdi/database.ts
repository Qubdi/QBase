// English text for one area of the Qubdi (server) screens. Other languages
// fall back to these until they are translated.
export const database = {
    connections: {
        title: 'Database connections',
        titleNew: 'New connection',
        titleEdit: 'Edit connection',
        descriptionList:
            'Saved for {{project}}. Its editors use them to import, re-sync and check drift. Passwords are stored encrypted and are never shown again.',
        descriptionForm: 'Connects read-only to read the schema.',
        noStore:
            'This server cannot store passwords yet, so no connection can be saved. Whoever runs it needs to set <code>CONNECTION_KEY</code> (at least 32 characters) and restart it.',
        loading: 'Loading…',
        empty: 'No connections yet.',
        listLabel: 'Connections',
        editAria: 'Edit {{name}}',
        deleteAria: 'Delete {{name}}',
        add: 'Add connection',
        namePlaceholder: 'Name, e.g. Production replica',
        nameLabel: 'Name',
        dialectLabel: 'Database type',
        host: 'Host',
        port: 'Port',
        database: 'Database',
        user: 'User',
        password: 'Password',
        passwordMoves: 'Password (required to change the host, port or type)',
        passwordKeep: 'Password (leave empty to keep the saved one)',
        ssl: 'Use SSL / TLS',
        sslOff: 'SSL / TLS is off: the password and the schema travel unencrypted. Use this only on a trusted network.',
        trustCertificate: 'Trust server certificate',
        testNeedsPassword: 'Type the password to test the connection',
        test: 'Test connection',
        back: 'Back',
        working: 'Working…',
        save: 'Save',
        tested_one: 'Connected to {{database}}. Found {{count}} schema.',
        tested_other: 'Connected to {{database}}. Found {{count}} schemas.',
        deleteTitle: 'Delete this connection?',
        deleteBody:
            '"{{name}}" is removed for everyone in {{project}}. Anything that uses it, such as a drift check, needs another connection.',
        cancel: 'Cancel',
        delete: 'Delete',
    },
    importFromDb: {
        badMetadata: 'The server returned metadata in an unexpected format.',
        title: 'Import from database',
        descriptionConnect:
            'Connect read-only to read the schema. Credentials are used for this request only unless you save the connection.',
        descriptionSelect: 'Choose the schemas and tables to import.',
        descriptionPreview: 'Review what will be created.',
        savedConnection: 'Saved connection',
        newConnection: 'New connection',
        dialectLabel: 'Database type',
        host: 'Host',
        port: 'Port',
        database: 'Database',
        user: 'User',
        password: 'Password',
        passwordSaved: 'Password (leave empty to use the saved one)',
        ssl: 'Use SSL / TLS',
        sslOff: 'SSL / TLS is off: the password and the schema travel unencrypted. Use this only on a trusted network.',
        trustCertificate: 'Trust server certificate',
        saveAsPlaceholder: 'Save this connection as… (optional)',
        saveAsLabel: 'Save connection as',
        connect: 'Connect',
        connecting: 'Connecting…',
        noTables: 'No tables found in this database.',
        schemaAria: 'Schema {{schema}}',
        viewSuffix: ' (view)',
        back: 'Back',
        next: 'Next',
        diagramName: 'Diagram name',
        tables_one: '{{count}} table',
        tables_other: '{{count}} tables',
        views_one: ' and {{count}} view',
        views_other: ' and {{count}} views',
        schemas_one: '{{count}} schema',
        schemas_other: '{{count}} schemas',
        summary:
            '{{tables}}{{views}} from {{schemas}} ({{list}}). Relationships between the selected tables are imported too.',
        create: 'Create diagram',
        creating: 'Creating…',
    },
    resync: {
        title: 'Re-sync from database',
        description:
            'Pull changes from the live database. Layout, colors, areas, notes and descriptions are kept.',
        noSource:
            'This diagram was not imported from a database in this browser, so there is no source to re-sync from. Use Import from database to create one.',
        lastSynced: 'Last synced {{date}}.',
        passwordLabel: 'Database password',
        passwordRequired: 'Enter the database password to continue.',
        checking: 'Checking…',
        check: 'Check for changes',
        clean: 'No changes. The diagram matches the database.',
        possibleRenames: 'Possible renames',
        back: 'Back',
        applying: 'Applying…',
        apply: 'Apply {{n}} selected',
        applied: 'Applied {{n}} change(s)',
        serverNotUpdated: 'Applied here, but the server copy is not updated',
    },
    drift: {
        badgeFailed: 'Check failed',
        badge: 'Drift: {{total}}',
        severity: {
            breaking: 'Breaking',
            warning: 'Warning',
            info: 'Info',
        },
        control: 'Drift',
        title: 'Database drift',
        description:
            'Compares this diagram with the live database and tells you where they no longer match.',
        notOnServer:
            'This diagram is not on the server yet. It is uploaded automatically when you save the settings.',
        nothing: 'Nothing.',
        savedConnection: 'Saved connection',
        chooseConnection: 'Choose a saved connection',
        addConnection: 'Add a connection',
        manageConnections: 'Manage connections',
        noConnections:
            'There is no saved connection in this project yet. Add the database this diagram describes to compare it with.',
        webhookLabel: 'Webhook URL',
        webhookPlaceholder:
            'Webhook URL (optional): receives a JSON POST when drift is found',
        webhookSaved:
            'Webhook saved for {{host}}: type a new URL to replace it',
        removeWebhook: 'Remove webhook',
        webhookRemoved:
            'The saved webhook is removed the next time you press Check now',
        working: 'Working…',
        checkNow: 'Check now',
        lastCheck: 'Last check {{date}}:',
        statusClean: 'no drift',
        statusError: 'check failed',
        statusDrifted: '{{n}} difference(s)',
        webhookSuffix: ' · webhook {{url}}',
        onlyInDatabase: 'Only in the database',
        onlyInDiagram: 'Only in the diagram',
        differs: 'Definitions differ',
        hint: 'Hint: {{hint}}',
        notImported:
            'This diagram was not imported from a database in this browser',
        update: 'Update diagram from database',
        dismissed: 'Dismissed',
        dismiss: 'Dismiss',
        noCheckYet:
            'No check has run yet. Choose a connection and press Check now.',
        thisProject: 'this project',
    },
    getLatest: {
        failedTitle: 'Could not get the latest version',
        title: 'Get the latest version?',
        description:
            '"{{name}}" is replaced by the version saved in the project. Changes to it that were not saved to the project are lost.',
        cancel: 'Cancel',
        confirm: 'Get latest',
        aria: 'Get latest from server',
    },
    lint: {
        button: 'Lint',
        panel: 'Lint',
        heading:
            'Schema lint ({{errors}} errors, {{warnings}} warnings, {{info}} info)',
        settings: 'Lint settings',
        close: 'Close lint',
        clean: 'No problems found.',
        severityTitle: {
            error: 'Errors',
            warning: 'Warnings',
            info: 'Info',
        },
        showOnCanvas: 'Show on the canvas',
        fix: 'Fix',
        fixStaleTitle: 'This fix no longer applies',
        fixStaleBody: 'The diagram changed since the check ran.',
        fixApplied: 'Fix applied',
        saveFailedTitle: 'Lint settings were not saved to the server',
        saveFailedBody: 'The previous settings are back. Try again.',
    },
    lintText: {
        messages: {
            noPrimaryKey: 'Table {{table}} has no primary key.',
            orphanTable: 'Table {{table}} has no relationships.',
            noDescription: 'Table {{table}} has no description.',
            reservedTable: 'Table name "{{table}}" is a reserved word.',
            reservedColumn: 'Column "{{table}}.{{column}}" is a reserved word.',
            varcharNoLength:
                'Column {{table}}.{{column}} is {{type}} without a length.',
            nullableInUniqueIndex:
                'Column {{table}}.{{column}} is nullable but part of unique index {{index}}.',
            nullableUnique:
                'Column {{table}}.{{column}} is nullable but unique.',
            indexRepeatsPk:
                'Index {{index}} on {{table}} repeats the primary key.',
            indexDuplicate:
                'Index {{index}} on {{table}} duplicates {{other}}.',
            indexCovered:
                'Index {{index}} on {{table}} is already covered by {{other}}.',
            indexCoveredByPk:
                'Index {{index}} on {{table}} is already covered by the primary key.',
            fkTypeMismatch:
                '{{from}}.{{column}} is {{type}} but references {{to}}.{{toColumn}} which is {{toType}}.',
            fkNoIndex:
                'Foreign key {{from}}({{columns}}) → {{to}} has no index.',
            tableCase: 'Table "{{name}}" is not {{style}}.',
            columnCase: 'Column "{{table}}.{{name}}" is not {{style}}.',
            tableSingular:
                'Table "{{table}}" is singular but most tables are plural.',
            tablePlural:
                'Table "{{table}}" is plural but most tables are singular.',
        },
        rules: {
            'table-without-primary-key': {
                title: 'Table without a primary key',
                description: 'Every table should have a primary key.',
            },
            'foreign-key-without-index': {
                title: 'Foreign key without an index',
                description:
                    'Joins and deletes on the parent are slow without an index on the foreign key column.',
            },
            'foreign-key-type-mismatch': {
                title: 'Foreign key type differs from the referenced column',
                description:
                    'The two columns of a relationship should have the same type.',
            },
            'nullable-in-unique-key': {
                title: 'Nullable column in a unique key',
                description:
                    'Most databases allow many NULLs in a unique key, so it does not enforce what it seems to.',
            },
            'duplicate-index': {
                title: 'Duplicate index',
                description:
                    'Two indexes on the same columns, or an index repeating the primary key.',
            },
            'overlapping-index': {
                title: 'Overlapping index',
                description:
                    'An index that is only the beginning of another index adds write cost for no benefit.',
            },
            'naming-case': {
                title: 'Inconsistent name style',
                description: 'Mixing snake_case and camelCase.',
            },
            'naming-plural': {
                title: 'Inconsistent table name number',
                description: 'Mixing singular and plural table names.',
            },
            'reserved-word': {
                title: 'Reserved word as a name',
                description:
                    'Names that are SQL reserved words need quoting everywhere.',
            },
            'orphan-table': {
                title: 'Table without relationships',
                description:
                    'A table nothing references and that references nothing.',
            },
            'missing-table-description': {
                title: 'Table without a description',
                description: 'Document what each table is for.',
            },
            'varchar-without-length': {
                title: 'varchar without a length',
                description:
                    'On SQL Server a bare varchar is one character; MySQL and MariaDB reject it.',
            },
        },
    },
    lintSettings: {
        title: 'Lint settings',
        description:
            'Choose which rules run for this diagram and how serious each one is.',
        rules: 'Rules',
        enabledCount: '{{enabled}} of {{total}} on',
        enableRule: 'Enable {{title}}',
        severityFor: 'Severity for {{title}}',
        severity: {
            error: 'Error',
            warning: 'Warning',
            info: 'Info',
        },
        naming: 'Naming',
        nameStyle: 'Name style',
        styleAuto: 'Detect from the diagram',
        tableNames: 'Table names',
        tablesConsistent: 'Consistent',
        tablesPlural: 'Plural',
        tablesSingular: 'Singular',
        tablesAny: 'Do not check',
        reset: 'Reset to defaults',
        cancel: 'Cancel',
        save: 'Save',
    },
};
