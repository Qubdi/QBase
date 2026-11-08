// English text for the SQL, JSON and image export dialogs.
export const exportingStrings = {
    sql: {
        title: 'Export SQL',
        description: 'Export your diagram schema to {{database}} script',
        script: 'Generated script',
        copy: 'Copy',
        copied: 'Script copied',
        download: 'Download .sql',
        nothing: 'There are no tables to export yet.',
    },
    json: {
        title: 'Export Diagram',
        description: 'Choose the format for export:',
        summary: '{{name}} (about {{size}} KB)',
        download: 'Download',
    },
    image: {
        title: 'Export Image',
        description: 'Choose the scale factor for export:',
        scale: 'Scale',
        scaleBest: '{{scale}}x (Best Quality)',
        advanced: 'Advanced Options',
        patternHelp: 'Add subtle grid pattern to background.',
        transparentHelp: 'Remove background color from image.',
        pattern: 'Include background pattern',
        transparent: 'Transparent background',
        jpegNote: 'JPEG cannot be transparent, so the page color is used.',
        action: 'Export',
        working: 'Creating the image',
        empty: 'There is nothing to put in the picture yet',
        failed: 'The image could not be created',
        lowered:
            'The picture is very large, so it was made at {{scale}}x to fit the browser limit',
    },
};
