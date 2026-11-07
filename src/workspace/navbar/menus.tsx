import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '@/components/qubdi/workspace-context';
import { LocalConfigContext } from '@/context/local-config-context/local-config-context';
import { isOpenOnly } from '@/core/model/database';
import { dialectFor } from '@/dialects/registry';
import { useDialog } from '@/hooks/use-dialog';
import { getOperatingSystem } from '@/lib/utils/utils';
import { useTheme } from '@/platform/theme/theme-context';
import type { Theme } from '@/platform/theme/theme-utils';
import {
    selectCanRedo,
    selectCanUndo,
    selectDatabaseType,
    selectLocked,
} from '@/store/selectors';
import { useEditorStore } from '@/store/store-context';
import { shortcutById, shortcutLabel } from '../shortcuts';
import type { ShortcutId } from '../shortcuts';
import type { WorkspaceCommands } from '../use-workspace-commands';
import {
    Menubar,
    MenubarCheckboxItem,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarRadioGroup,
    MenubarRadioItem,
    MenubarSeparator,
    MenubarShortcut,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarTrigger,
} from './menubar-parts';
import { exportTargets } from './export-targets';

const Keys: React.FC<{ id: ShortcutId }> = ({ id }) => (
    <MenubarShortcut>
        {shortcutLabel(shortcutById(id), getOperatingSystem() === 'mac')}
    </MenubarShortcut>
);

export interface MenusProps {
    commands: WorkspaceCommands;
}

/** The three menus of the navbar: Diagram, Edit and View. */
export const Menus: React.FC<MenusProps> = ({ commands }) => {
    const { t } = useTranslation();
    const dialogs = useDialog();
    const config = useContext(LocalConfigContext);
    const workspace = useWorkspace();
    const { theme, setTheme } = useTheme();
    const type = useEditorStore(selectDatabaseType);
    const locked = useEditorStore(selectLocked);
    const canUndo = useEditorStore(selectCanUndo);
    const canRedo = useEditorStore(selectCanRedo);
    const panelOpen = useEditorStore((s) => s.ui.panel.open);
    const openOnly = isOpenOnly(type);
    const targets = exportTargets(type);
    // in a project only its owners may delete a diagram (spec P12)
    const mayDelete = workspace ? workspace.project.role === 'owner' : true;

    return (
        <Menubar aria-label={t('editor.workspace.menu.label')}>
            <MenubarMenu>
                <MenubarTrigger>
                    {t('editor.workspace.menu.diagram.label')}
                </MenubarTrigger>
                <MenubarContent>
                    <MenubarSub>
                        <MenubarSubTrigger>
                            {t('editor.workspace.menu.diagram.import')}
                        </MenubarSubTrigger>
                        <MenubarSubContent>
                            <MenubarItem
                                onSelect={dialogs.openImportDiagramDialog}
                            >
                                {t('editor.workspace.menu.diagram.importFile')}
                            </MenubarItem>
                            <MenubarSeparator />
                            <MenubarItem
                                disabled={locked || openOnly}
                                onSelect={() =>
                                    dialogs.openImportDatabaseDialog({
                                        methods: ['sql'],
                                        initial: 'sql',
                                    })
                                }
                            >
                                {t('editor.workspace.menu.diagram.importSql')}
                            </MenubarItem>
                            <MenubarItem
                                disabled={locked || openOnly}
                                onSelect={() =>
                                    dialogs.openImportDatabaseDialog({
                                        methods: ['dbml'],
                                        initial: 'dbml',
                                    })
                                }
                            >
                                {t('editor.workspace.menu.diagram.importDbml')}
                            </MenubarItem>
                        </MenubarSubContent>
                    </MenubarSub>
                    <MenubarSeparator />
                    <MenubarSub>
                        <MenubarSubTrigger disabled={targets.length === 0}>
                            {t('editor.workspace.menu.diagram.exportSql')}
                        </MenubarSubTrigger>
                        <MenubarSubContent>
                            {targets.map((target) => (
                                <MenubarItem
                                    key={target}
                                    onSelect={() =>
                                        dialogs.openExportSqlDialog(target)
                                    }
                                >
                                    {dialectFor(target).label}
                                </MenubarItem>
                            ))}
                        </MenubarSubContent>
                    </MenubarSub>
                    <MenubarSub>
                        <MenubarSubTrigger>
                            {t('editor.workspace.menu.diagram.saveAs')}
                        </MenubarSubTrigger>
                        <MenubarSubContent>
                            <MenubarItem
                                onSelect={() =>
                                    dialogs.openExportImageDialog('png')
                                }
                            >
                                {t('editor.workspace.menu.diagram.png')}
                            </MenubarItem>
                            <MenubarItem
                                onSelect={() =>
                                    dialogs.openExportImageDialog('jpeg')
                                }
                            >
                                {t('editor.workspace.menu.diagram.jpeg')}
                            </MenubarItem>
                            <MenubarItem
                                onSelect={() =>
                                    dialogs.openExportImageDialog('svg')
                                }
                            >
                                {t('editor.workspace.menu.diagram.svg')}
                            </MenubarItem>
                            <MenubarSeparator />
                            <MenubarItem
                                onSelect={dialogs.openExportJsonDialog}
                            >
                                {t('editor.workspace.menu.diagram.json')}
                            </MenubarItem>
                        </MenubarSubContent>
                    </MenubarSub>
                    {mayDelete ? (
                        <>
                            <MenubarSeparator />
                            <MenubarItem
                                className="text-destructive focus:text-destructive"
                                onSelect={dialogs.openDeleteDiagramDialog}
                            >
                                {t('editor.workspace.menu.diagram.delete')}
                            </MenubarItem>
                        </>
                    ) : null}
                </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
                <MenubarTrigger>
                    {t('editor.workspace.menu.edit.label')}
                </MenubarTrigger>
                <MenubarContent>
                    <MenubarItem disabled={!canUndo} onSelect={commands.undo}>
                        {t('editor.workspace.menu.edit.undo')}
                        <Keys id="undo" />
                    </MenubarItem>
                    <MenubarItem disabled={!canRedo} onSelect={commands.redo}>
                        {t('editor.workspace.menu.edit.redo')}
                        <Keys id="redo" />
                    </MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem
                        disabled={locked}
                        onSelect={dialogs.openClearDiagramDialog}
                    >
                        {t('editor.workspace.menu.edit.clear')}
                    </MenubarItem>
                </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
                <MenubarTrigger>
                    {t('editor.workspace.menu.view.label')}
                </MenubarTrigger>
                <MenubarContent>
                    <MenubarCheckboxItem
                        checked={panelOpen}
                        onCheckedChange={() => commands.togglePanel?.()}
                    >
                        {t('editor.workspace.menu.view.sidePanel')}
                        <Keys id="togglePanel" />
                    </MenubarCheckboxItem>
                    <MenubarSeparator />
                    <MenubarCheckboxItem
                        checked={config.showCardinality}
                        onCheckedChange={config.setShowCardinality}
                    >
                        {t('editor.workspace.menu.view.cardinality')}
                    </MenubarCheckboxItem>
                    <MenubarCheckboxItem
                        checked={config.showFieldAttributes}
                        onCheckedChange={config.setShowFieldAttributes}
                    >
                        {t('editor.workspace.menu.view.fieldAttributes')}
                    </MenubarCheckboxItem>
                    <MenubarCheckboxItem
                        checked={config.compactTables}
                        onCheckedChange={config.setCompactTables}
                    >
                        {t('editor.workspace.menu.view.compactTables')}
                    </MenubarCheckboxItem>
                    <MenubarCheckboxItem
                        checked={config.showMinimap}
                        onCheckedChange={config.setShowMinimap}
                    >
                        {t('editor.workspace.menu.view.minimap')}
                    </MenubarCheckboxItem>
                    <MenubarCheckboxItem
                        checked={config.showDbViews}
                        onCheckedChange={config.setShowDbViews}
                    >
                        {t('editor.workspace.menu.view.views')}
                    </MenubarCheckboxItem>
                    <MenubarSeparator />
                    <MenubarSub>
                        <MenubarSubTrigger>
                            {t('editor.workspace.menu.view.wheel')}
                        </MenubarSubTrigger>
                        <MenubarSubContent>
                            <MenubarRadioGroup
                                value={config.scrollAction}
                                onValueChange={(v) =>
                                    config.setScrollAction(
                                        v === 'zoom' ? 'zoom' : 'pan'
                                    )
                                }
                            >
                                <MenubarRadioItem value="pan">
                                    {t('editor.workspace.menu.view.wheelPan')}
                                </MenubarRadioItem>
                                <MenubarRadioItem value="zoom">
                                    {t('editor.workspace.menu.view.wheelZoom')}
                                </MenubarRadioItem>
                            </MenubarRadioGroup>
                        </MenubarSubContent>
                    </MenubarSub>
                    <MenubarSub>
                        <MenubarSubTrigger>
                            {t('editor.workspace.menu.view.theme')}
                        </MenubarSubTrigger>
                        <MenubarSubContent>
                            <MenubarRadioGroup
                                value={theme}
                                onValueChange={(v) => setTheme(v as Theme)}
                            >
                                {(['system', 'light', 'dark'] as const).map(
                                    (v) => (
                                        <MenubarRadioItem key={v} value={v}>
                                            {t(
                                                `editor.workspace.menu.view.themes.${v}`
                                            )}
                                        </MenubarRadioItem>
                                    )
                                )}
                            </MenubarRadioGroup>
                            <MenubarSeparator />
                            <MenubarItem disabled>
                                {t('editor.workspace.menu.view.themeKey')}
                                <Keys id="toggleTheme" />
                            </MenubarItem>
                        </MenubarSubContent>
                    </MenubarSub>
                    <MenubarSeparator />
                    <MenubarItem onSelect={dialogs.openSettingsDialog}>
                        {t('editor.workspace.menu.view.preferences')}
                    </MenubarItem>
                </MenubarContent>
            </MenubarMenu>
        </Menubar>
    );
};
