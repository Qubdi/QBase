import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { sidePanelStrings } from '@/i18n/editor/side-panel';
import '@/i18n/editor/side-panel-register';

type Leaves<T, P extends string = ''> = {
    [K in keyof T & string]: T[K] extends string
        ? `${P}${K}`
        : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** A key of the side panel's text, such as `tables.add`. Misspelling one is a type error. */
export type TextKey = Leaves<typeof sidePanelStrings>;

/** The translator of the side panel; values replace `{{name}}` in the text. */
export type Text = (
    key: TextKey,
    values?: Record<string, string | number>
) => string;

export function useText(): Text {
    const { t } = useTranslation();
    return useCallback(
        (key, values) => t(`editor.sidePanel.${key}`, values),
        [t]
    );
}
