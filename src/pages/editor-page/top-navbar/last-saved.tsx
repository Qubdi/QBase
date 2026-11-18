import React from 'react';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { useDiagram } from '@/qbase/use-diagram';
import { ago } from '@/lib/qubdi/when';
import { uiLocale } from '@/lib/qubdi/locale';

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
    // re-renders when the language changes; `ago` reads the language itself
    useTranslation();
    const { currentDiagram } = useDiagram();
    const when = ago(currentDiagram.updatedAt.toISOString());
    const text = savedText(when);
    return (
        <span
            role="img"
            aria-label={text}
            title={`${text}\n${currentDiagram.updatedAt.toLocaleString(uiLocale())}`}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground [&_svg]:size-4"
        >
            <Save />
        </span>
    );
};
