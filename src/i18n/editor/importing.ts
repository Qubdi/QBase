// English text for bringing a schema in: the file dialog, the paste box used by
// the new-diagram flow and by "import into this diagram", and the table picker.
export const importingStrings = {
    file: {
        title: 'Open a saved diagram',
        description:
            'Choose a .json file that was saved from QBase. It is added as a new diagram.',
        drop: 'Drop a file here, or click to choose one',
        action: 'Import',
        invalid:
            'That file is not a diagram saved from QBase, so nothing was imported.',
        failed: 'The file could not be imported. Please try again.',
    },
    box: {
        method: { metadata: 'Database query', sql: 'SQL script', dbml: 'DBML' },
        field: {
            metadata: 'Query result',
            sql: 'SQL script',
            dbml: 'DBML text',
        },
        placeholder: {
            metadata: 'Paste the result of the query here',
            sql: 'Paste CREATE TABLE statements here',
            dbml: 'Paste DBML here',
        },
        edition: 'Edition',
        editionStandard: 'Standard',
        editions: {
            supabase: 'Supabase',
            timescale: 'Timescale',
            mysql_5_7: 'MySQL 5.7',
            sql_server_2016_and_below: 'SQL Server 2016 and older',
            cloudflare_d1: 'Cloudflare D1',
        },
        scriptIntro:
            'Run the query in your own database client, then paste the single result cell below.',
        copyScript: 'Copy the query',
        noScript: 'No ready-made query is shipped for this database yet.',
        scriptCopied: 'Query copied',
        truncated:
            'The pasted text is exactly 65,535 characters long, which usually means your client cut it off. Export the cell to a file instead of copying it from the grid.',
        repair: 'Repair the text',
        repairing: 'Repairing the text...',
        repaired: 'The text was repaired.',
        moreProblems_one: '{{count}} more problem',
        moreProblems_other: '{{count}} more problems',
        found: 'Found {{tables}} and {{links}}.',
        foundTables_one: '{{count}} table',
        foundTables_other: '{{count}} tables',
        foundLinks_one: '{{count}} relationship',
        foundLinks_other: '{{count}} relationships',
        nothing: 'There is nothing to import in this text.',
    },
    picker: {
        title: 'Choose what to bring in',
        summary: '{{selected}} of {{total}} chosen (at most {{limit}})',
        search: 'Search by name',
        kind: 'Kind',
        kindAll: 'Tables and views',
        kindTables: 'Tables only',
        kindViews: 'Views only',
        schema: 'Schema',
        schemaAll: 'All schemas',
        selectPage: 'Choose everything on this page',
        viewTag: 'view',
        previous: 'Previous',
        next: 'Next',
        page: 'Page {{page}} of {{pages}}',
    },
    into: {
        title: 'Add to this diagram',
        description:
            'New tables are placed to the right of what is already here. The history is cleared afterwards.',
        newTables_one: '{{count}} table will be added.',
        newTables_other: '{{count}} tables will be added.',
        newLinks_one: '{{count}} relationship will be added.',
        newLinks_other: '{{count}} relationships will be added.',
        newTypes_one: '{{count}} custom type will be added.',
        newTypes_other: '{{count}} custom types will be added.',
        duplicates:
            'These tables already exist and will appear twice: {{names}}',
        apply: 'Add to diagram',
        done_one: 'Added {{count}} table',
        done_other: 'Added {{count}} tables',
        failed: 'Nothing was imported',
    },
};
