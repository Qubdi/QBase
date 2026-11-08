import React from 'react';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { format, register } from 'timeago.js';
import de from 'timeago.js/lib/lang/de';
import fr from 'timeago.js/lib/lang/fr';
import it from 'timeago.js/lib/lang/it';
import ka from 'timeago.js/lib/lang/ka';
import ru from 'timeago.js/lib/lang/ru';
import zhCN from 'timeago.js/lib/lang/zh_CN';
import zhTW from 'timeago.js/lib/lang/zh_TW';
import { useDiagram } from '@/qbase/use-diagram';
import { wordsFunction } from './words-function';

// The languages that have "time ago" wording (spec A4); any other reads English.
const WORDS = {
    de,
    fr,
    it,
    ka,
    ru,
    zh_CN: zhCN,
    zh_TW: zhTW,
};
for (const [code, words] of Object.entries(WORDS))
    register(code, wordsFunction(words));

/** The wording set for a language code such as `de`, `pt_BR` or `zh-TW`; English when there is none. */
const wordsFor = (language: string): string => {
    const code = language.replace('-', '_');
    if (code in WORDS) return code;
    const base = code.split('_')[0];
    return base in WORDS ? base : 'en_US';
};

/** "5 minutes ago" in the page's language. */
const ago = (date: Date, language: string): string =>
    format(date, wordsFor(language));

/** "Saved 5 minutes ago"; the words come from the translations once they are loaded. */
const savedText = (when: string): string =>
    (i18next.isInitialized
        ? (i18next.t('qubdi.workspace.lastSaved', {
              when,
              defaultValue: `Saved ${when}`,
          }) as string)
        : undefined) ?? `Saved ${when}`;

/**
 * The save mark in the navbar when no server is involved: a check whose hover
 * text says when the diagram was last saved in this browser.
 */
export const LastSaved: React.FC = () => {
    const { i18n } = useTranslation();
    const { currentDiagram } = useDiagram();
    const when = ago(currentDiagram.updatedAt, i18n.language);
    const text = savedText(when);
    return (
        <span
            role="img"
            aria-label={text}
            title={`${text}\n${currentDiagram.updatedAt.toLocaleString()}`}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground [&_svg]:size-4"
        >
            <Save />
        </span>
    );
};
