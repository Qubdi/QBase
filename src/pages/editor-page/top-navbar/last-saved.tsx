import React from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { format, register } from 'timeago.js';
import bn from 'timeago.js/lib/lang/bn_IN';
import de from 'timeago.js/lib/lang/de';
import es from 'timeago.js/lib/lang/es';
import fr from 'timeago.js/lib/lang/fr';
import hi from 'timeago.js/lib/lang/hi_IN';
import ja from 'timeago.js/lib/lang/ja';
import ko from 'timeago.js/lib/lang/ko';
import ptBR from 'timeago.js/lib/lang/pt_BR';
import ru from 'timeago.js/lib/lang/ru';
import zhCN from 'timeago.js/lib/lang/zh_CN';
import zhTW from 'timeago.js/lib/lang/zh_TW';
import { useDiagram } from '@/qbase/use-diagram';
import { wordsFunction } from './words-function';

// The 12 languages that have "time ago" wording (spec A4); the rest read English.
const WORDS = {
    bn,
    de,
    es,
    fr,
    hi,
    ja,
    ko,
    pt_BR: ptBR,
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
            <Check />
        </span>
    );
};
