import React from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { format } from 'timeago.js';
import { useDiagram } from '@/qbase/use-diagram';

/** "5 minutes ago" in the page's language. */
const ago = (date: Date, language: string): string =>
    format(date, language.split('-')[0]);

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
