import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Where the side panel goes (the sections of the diagram: tables, DBML, refs,
 * custom types, visuals). The side-panel module replaces the body; the frame
 * only decides how wide the place is and when it is shown.
 */
export const SidePanelSlot: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div
            data-slot="side-panel"
            className="h-full w-full overflow-auto p-3 text-sm text-muted-foreground"
        >
            {t('editor.workspace.frame.panelPlaceholder')}
        </div>
    );
};
