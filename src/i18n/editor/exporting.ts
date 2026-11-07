// English text for the SQL, JSON and image export dialogs.
export const exportingStrings = {
    sql: {
        title: 'SQL for {{database}}',
        description: 'The script covers the tables that are currently shown.',
        script: 'Generated script',
        copy: 'Copy',
        copied: 'Script copied',
        copyFailed: 'Copying is not available in this browser',
        download: 'Download .sql',
        nothing: 'There are no tables to export yet.',
    },
    json: {
        title: 'Save as a diagram file',
        description:
            'The file keeps the whole diagram and can be opened again from the new-diagram screen.',
        summary: '{{name}} (about {{size}} KB)',
        download: 'Download',
    },
    image: {
        title: 'Save as {{format}}',
        description:
            'The picture shows the whole diagram, in the colors you are using now.',
        scale: 'Size',
        pattern: 'Draw the dotted background',
        transparent: 'Transparent background',
        jpegNote: 'JPEG cannot be transparent, so the page color is used.',
        action: 'Save image',
        working: 'Creating the image',
        empty: 'There is nothing to put in the picture yet',
        failed: 'The image could not be created',
        lowered:
            'The picture is very large, so it was made at {{scale}}x to fit the browser limit',
    },
};
