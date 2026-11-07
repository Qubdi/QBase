import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Braces,
    FolderOpen,
    GitBranch,
    Plus,
    Shapes,
    Table2,
    FileCode2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { traitsOf } from '@/core/model/database';
import { useDialog } from '@/hooks/use-dialog';
import { cn } from '@/lib/utils/utils';
import type { PanelSection } from '@/store/editor-state';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';

interface SectionItem {
    section: PanelSection;
    icon: LucideIcon;
    /** needs a database with custom types */
    userTypes?: boolean;
}

const SECTIONS: readonly SectionItem[] = [
    { section: 'tables', icon: Table2 },
    { section: 'dbml', icon: FileCode2 },
    { section: 'refs', icon: GitBranch },
    { section: 'customTypes', icon: Braces, userTypes: true },
    { section: 'visuals', icon: Shapes },
];

const RailButton: React.FC<{
    icon: LucideIcon;
    label: string;
    active?: boolean;
    onClick: () => void;
}> = ({ icon: Icon, label, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
            'flex w-full flex-col items-center gap-1 rounded-md px-1 py-2 text-center text-[11px] leading-tight hover:bg-accent',
            active && 'bg-primary/10 text-primary'
        )}
    >
        <Icon className="size-5" />
        <span className="break-words">{label}</span>
    </button>
);

/**
 * The icon rail on the left (spec A7): New and Browse, then one button per
 * section of the side panel. Choosing a section shows the panel on it.
 */
export const Rail: React.FC<{ onAction?: () => void }> = ({ onAction }) => {
    const { t } = useTranslation();
    const dialogs = useDialog();
    const store = useEditorStoreApi();
    const type = useEditorStore((s) => s.design.databaseType);
    const panel = useEditorStore((s) => s.ui.panel);
    const hasUserTypes = traitsOf(type).hasUserTypes;

    return (
        <nav
            aria-label={t('editor.workspace.rail.label')}
            className="flex h-full w-16 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-background p-1"
        >
            <RailButton
                icon={Plus}
                label={t('editor.workspace.rail.new')}
                onClick={() => {
                    dialogs.openCreateDiagramDialog();
                    onAction?.();
                }}
            />
            <RailButton
                icon={FolderOpen}
                label={t('editor.workspace.rail.browse')}
                onClick={() => {
                    dialogs.openOpenDiagramDialog({ canClose: true });
                    onAction?.();
                }}
            />
            <hr className="my-1" />
            {SECTIONS.filter((s) => !s.userTypes || hasUserTypes).map(
                ({ section, icon }) => (
                    <RailButton
                        key={section}
                        icon={icon}
                        label={t(`editor.workspace.rail.${section}`)}
                        active={panel.open && panel.section === section}
                        onClick={() => {
                            store
                                .getState()
                                .showPanel(
                                    section,
                                    section === 'visuals' ? 'areas' : undefined
                                );
                            onAction?.();
                        }}
                    />
                )
            )}
        </nav>
    );
};
