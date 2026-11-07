import React from 'react';
import { useTranslation } from 'react-i18next';
import '@/i18n/editor/register';

/**
 * Where the canvas goes. The canvas module replaces the body of this
 * component; the element keeps `data-slot="canvas"` so image export can find
 * the surface even before the canvas registers its own capture target.
 */
export const CanvasSlot: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div
            data-slot="canvas"
            className="relative flex h-full w-full items-center justify-center bg-muted/30 text-sm text-muted-foreground"
        >
            {t('editor.workspace.frame.canvasPlaceholder')}
        </div>
    );
};
