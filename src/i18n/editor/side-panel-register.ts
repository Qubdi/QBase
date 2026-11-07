import { i18n } from '@/i18n/i18n';
import { sidePanelStrings } from './side-panel';

/**
 * Puts the side panel's English text into i18next under `editor.sidePanel`
 * until the owner merges it into `locales/en.ts`. Importing it twice is harmless.
 */
i18n.addResourceBundle(
    'en',
    'translation',
    { editor: { sidePanel: sidePanelStrings } },
    true,
    false
);
