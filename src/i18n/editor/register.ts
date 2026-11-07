import { i18n } from '@/i18n/i18n';
import { designsStrings } from './designs';
import { exportingStrings } from './exporting';
import { importingStrings } from './importing';
import { settingsStrings } from './settings';
import { workspaceStrings } from './workspace';

/**
 * Puts the editor's English text into i18next. The owner will later merge the
 * five objects into `locales/en.ts` under `editor`; until then this keeps the
 * screens readable. Importing the file twice is harmless.
 */
export const editorStrings = {
    editor: {
        common: workspaceStrings.common,
        workspace: workspaceStrings.workspace,
        designs: designsStrings,
        importing: importingStrings,
        exporting: exportingStrings,
        settings: settingsStrings,
    },
};

i18n.addResourceBundle('en', 'translation', editorStrings, true, false);
