import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu as MenuIcon } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { AccountMenu } from '@/components/qubdi/account-menu';
import { DriftControl } from '@/components/qubdi/drift-control';
import { GetLatestControl } from '@/components/qubdi/get-latest-control';
import { LintControl } from '@/components/qubdi/lint-control';
import { PublishControl } from '@/components/qubdi/publish-control';
import { ServerSaveStatus } from '@/components/qubdi/server-autosave';
import { Logo } from '@/components/logo/logo';
import { LastSaved } from '@/pages/editor-page/top-navbar/last-saved';
import type { WorkspaceCommands } from '../use-workspace-commands';
import { DiagramName } from './diagram-name';
import { LanguageButton } from './language-button';
import { Menus } from './menus';

/** A named place in the frame where a QBase part is mounted (spec B2). */
export const Slot: React.FC<
    React.PropsWithChildren<{ name: string; className?: string }>
> = ({ name, className, children }) => (
    <div data-slot={name} className={className}>
        {children}
    </div>
);

/** The controls QBase adds to the right of the bar, in the order of spec B2. */
const SaveAndPublishControls: React.FC = () => (
    <>
        <ServerSaveStatus fallback={<LastSaved />} />
        <GetLatestControl />
        <LintControl />
        <DriftControl />
        <PublishControl />
    </>
);

export interface TopNavbarProps {
    commands: WorkspaceCommands;
}

/** Desktop bar, 48 px: logo and menus left, the diagram name in the middle, QBase controls right. */
export const TopNavbar: React.FC<TopNavbarProps> = ({ commands }) => {
    const { t } = useTranslation();
    return (
        <header className="relative z-10 grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b bg-background px-4">
            <Slot name="navbar-left" className="flex items-center gap-2">
                <Link
                    to="/"
                    aria-label={t('editor.workspace.navbar.home')}
                    className="h-6"
                >
                    <Logo />
                </Link>
                <Menus commands={commands} />
            </Slot>
            <DiagramName />
            <Slot
                name="navbar-right"
                className="flex items-center justify-end gap-2"
            >
                <div className="hidden items-center gap-2 sm:flex">
                    <SaveAndPublishControls />
                    <AccountMenu />
                </div>
                <LanguageButton />
            </Slot>
        </header>
    );
};

export interface MobileNavbarProps extends TopNavbarProps {
    railOpen: boolean;
    onToggleRail: () => void;
}

/**
 * Phone bar, two rows (about 100 px). In the page the order stays QBase,
 * language, the menus, then the name (SHL-068); a grid draws the name between
 * the logo and the language button, so the second row holds only the menus and
 * the save, lint and publish controls, which scroll sideways (SHL-069).
 */
export const MobileNavbar: React.FC<MobileNavbarProps> = ({
    commands,
    railOpen,
    onToggleRail,
}) => {
    const { t } = useTranslation();
    return (
        <header className="relative z-10 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[44px_auto_auto] border-b bg-background pb-1">
            <div className="col-start-1 row-start-1 flex items-center gap-2 pl-3">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-expanded={railOpen}
                    aria-label={
                        railOpen
                            ? t('editor.workspace.navbar.hideTools')
                            : t('editor.workspace.navbar.showTools')
                    }
                    onClick={onToggleRail}
                >
                    <MenuIcon />
                </Button>
                <Logo className="text-base font-semibold" />
            </div>
            <Slot
                name="navbar-right"
                className="col-start-3 row-start-1 flex items-center gap-1 pr-4"
            >
                <AccountMenu />
                <LanguageButton />
            </Slot>
            <div className="col-span-3 row-start-2 flex items-center gap-2 overflow-x-auto px-3">
                <Menus commands={commands} />
                {/* the saved mark and the Lint pill stay on the desktop bar; the
                    server controls have a place here when there is a server */}
                <ServerSaveStatus fallback={null} />
                <GetLatestControl />
                <DriftControl />
                <PublishControl />
            </div>
            <div
                data-testid="phone-name-row"
                className="col-span-3 row-start-3 flex min-w-0 items-center justify-center px-1 pt-1"
            >
                <DiagramName />
            </div>
        </header>
    );
};
