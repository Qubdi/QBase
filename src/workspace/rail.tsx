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
    /** icon and label side by side (the phone drawer) instead of stacked */
    row?: boolean;
    onClick: () => void;
}> = ({ icon: Icon, label, active, row, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        title={label}
        aria-pressed={active}
        className={cn(
            'flex w-full items-center rounded-md text-sidebar-foreground transition-colors hover:bg-rail-hover',
            row
                ? 'min-h-8 gap-2 px-2 py-1 text-start text-sm'
                : 'flex-col gap-1.5 px-0 py-2 text-center text-[10px] font-normal leading-tight',
            active &&
                'bg-sidebar-accent font-medium text-rail-selected hover:bg-sidebar-accent'
        )}
    >
        <Icon className="size-4" />
        <span
            className={
                // one long word (German "Beziehungen") must still fit the rail
                row || /\s/.test(label) || label.length <= 8
                    ? 'break-words'
                    : '[overflow-wrap:anywhere]'
            }
        >
            {label}
        </span>
    </button>
);

/**
 * The icon rail on the left (spec A7): New and Browse, then one button per
 * section of the side panel. Choosing a section shows the panel on it.
 */
export const Rail: React.FC<{ onAction?: () => void; row?: boolean }> = ({
    onAction,
    row,
}) => {
    const { t } = useTranslation();
    const dialogs = useDialog();
    const store = useEditorStoreApi();
    const type = useEditorStore((s) => s.design.databaseType);
    const panel = useEditorStore((s) => s.ui.panel);
    const hasUserTypes = traitsOf(type).hasUserTypes;

    return (
        <nav
            aria-label={t('editor.workspace.rail.label')}
            className={cn(
                'flex h-full shrink-0 flex-col gap-1 overflow-y-auto bg-background p-2',
                row ? 'w-full' : 'w-[52px] border-r'
            )}
        >
            <RailButton
                icon={Plus}
                row={row}
                label={t('editor.workspace.rail.new')}
                onClick={() => {
                    dialogs.openCreateDiagramDialog();
                    onAction?.();
                }}
            />
            <RailButton
                icon={FolderOpen}
                row={row}
                label={t('editor.workspace.rail.browse')}
                onClick={() => {
                    dialogs.openOpenDiagramDialog({ canClose: true });
                    onAction?.();
                }}
            />
            <hr className="mx-auto my-1 w-9" />
            {SECTIONS.filter((s) => !s.userTypes || hasUserTypes).map(
                ({ section, icon }) => (
                    <RailButton
                        key={section}
                        icon={icon}
                        row={row}
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
