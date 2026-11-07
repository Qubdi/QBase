import React from 'react';
import { SidePanel } from '@/pages/editor-page/side-panel/side-panel';
import { useCanvasActions } from './canvas-bridge-context';

/**
 * Where the side panel goes (the sections of the diagram: tables, DBML, refs,
 * custom types, visuals). The frame only decides how wide the place is and when
 * it is shown; `onFocused` lets a phone close its drawer after the panel asked
 * the canvas to show something (EDT-010).
 */
export const SidePanelSlot: React.FC<{ onFocused?: () => void }> = ({
    onFocused,
}) => {
    const { viewportOrigin } = useCanvasActions();
    return (
        <div data-slot="side-panel" className="h-full w-full overflow-auto">
            <SidePanel viewportOrigin={viewportOrigin} onFocused={onFocused} />
        </div>
    );
};
