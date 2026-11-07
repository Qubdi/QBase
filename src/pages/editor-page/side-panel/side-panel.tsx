import React, { Suspense } from 'react';
import { traitsOf } from '@/core/model/database';
import { PanelContextValue } from '@/platform/panel/panel-context';
import type { PanelContext } from '@/platform/panel/panel-context';
import { Spinner } from '@/platform/ui/spinner';
import { selectDatabaseType, selectPanel } from '@/store/selectors';
import { useEditorStore } from '@/store/store-context';
import { RefsSection } from '@/features/links/refs-section';
import { VisualsSection } from '@/features/regions-memos/visuals-section';
import { TablesSection } from '@/features/tables/tables-section';
import { UserTypesSection } from '@/features/user-types/user-types-section';
import '@/i18n/editor/side-panel-register';

// The DBML library is heavy and few visits use it: load it when the section opens.
const DbmlSection = React.lazy(() =>
    import('./dbml-section/dbml-section').then((m) => ({
        default: m.DbmlSection,
    }))
);

/**
 * The body of the side panel: the section the store names (EDT-002, EDT-003).
 * The frame around it (rail, resize handle, phone drawer) belongs to the
 * workspace; it passes `viewportOrigin` so a new table lands in view and
 * `onFocused` so a phone can close its drawer after a focus (EDT-010).
 */
export const SidePanel: React.FC<PanelContext> = ({
    viewportOrigin,
    onFocused,
}) => {
    const { section } = useEditorStore(selectPanel);
    const hasUserTypes = traitsOf(
        useEditorStore(selectDatabaseType)
    ).hasUserTypes;
    const context = React.useMemo(
        () => ({ viewportOrigin, onFocused }),
        [viewportOrigin, onFocused]
    );

    let body: React.ReactNode;
    switch (section) {
        case 'dbml':
            body = (
                <Suspense
                    fallback={
                        <div className="flex justify-center p-6">
                            <Spinner />
                        </div>
                    }
                >
                    <DbmlSection />
                </Suspense>
            );
            break;
        case 'refs':
            body = <RefsSection />;
            break;
        case 'customTypes':
            body = hasUserTypes ? <UserTypesSection /> : <TablesSection />;
            break;
        case 'visuals':
            body = <VisualsSection />;
            break;
        default:
            body = <TablesSection />;
    }
    return (
        <PanelContextValue.Provider value={context}>
            <div
                data-slot="side-panel"
                className="h-full w-full overflow-hidden"
            >
                {body}
            </div>
        </PanelContextValue.Provider>
    );
};
