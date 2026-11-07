import React from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer } from 'vaul';
import { OptionSelect } from '@/components/option-select/option-select';
import { traitsOf } from '@/core/model/database';
import type { PanelSection, VisualsTab } from '@/store/editor-state';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { SidePanelSlot } from './side-panel-slot';

/** The entries of the phone's section list: Areas and Notes are the two Visuals tabs. */
type Entry = 'tables' | 'dbml' | 'refs' | 'customTypes' | 'areas' | 'notes';

const target = (entry: Entry): { section: PanelSection; tab?: VisualsTab } =>
    entry === 'areas' || entry === 'notes'
        ? { section: 'visuals', tab: entry }
        : { section: entry };

const entryOf = (section: PanelSection, tab: VisualsTab): Entry =>
    section === 'visuals' ? tab : section;

/**
 * On a phone the side panel is a drawer that slides up. A list at the top
 * replaces the icon rail; unlike the old editor it offers DBML and keeps Areas
 * and Notes apart (SHL-071).
 */
export const MobilePanel: React.FC = () => {
    const { t } = useTranslation();
    const store = useEditorStoreApi();
    const open = useEditorStore((s) => s.ui.panel.open);
    const section = useEditorStore((s) => s.ui.panel.section);
    const tab = useEditorStore((s) => s.ui.panel.visualsTab);
    const type = useEditorStore((s) => s.design.databaseType);
    const entries: Entry[] = [
        'tables',
        'dbml',
        'refs',
        ...(traitsOf(type).hasUserTypes ? (['customTypes'] as const) : []),
        'areas',
        'notes',
    ];

    return (
        <Drawer.Root
            open={open}
            onOpenChange={(next) =>
                next
                    ? store.getState().showPanel()
                    : store.getState().hidePanel()
            }
        >
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
                <Drawer.Content
                    aria-describedby="mobile-panel-description"
                    className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-xl border bg-background"
                >
                    <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted" />
                    <div className="px-4 pb-2 pt-3">
                        <Drawer.Title className="text-base font-semibold">
                            {t('editor.workspace.drawer.title')}
                        </Drawer.Title>
                        <Drawer.Description
                            id="mobile-panel-description"
                            className="text-sm text-muted-foreground"
                        >
                            {t('editor.workspace.drawer.description')}
                        </Drawer.Description>
                    </div>
                    <div className="px-4 pb-2">
                        <OptionSelect
                            aria-label={t('editor.workspace.drawer.sections')}
                            value={entryOf(section, tab)}
                            onValueChange={(v) => {
                                const next = target(v as Entry);
                                store
                                    .getState()
                                    .showPanel(next.section, next.tab);
                            }}
                            options={entries.map((e) => ({
                                value: e,
                                label: t(
                                    `editor.workspace.drawer.entries.${e}`
                                ),
                            }))}
                        />
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                        <SidePanelSlot
                            heading={false}
                            onFocused={() => store.getState().hidePanel()}
                        />
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
};
