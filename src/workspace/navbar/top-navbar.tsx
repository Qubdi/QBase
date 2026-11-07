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
import '@/i18n/editor/register';

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
        <header className="relative z-10 grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b bg-background/80 px-3 backdrop-blur">
            <Slot name="navbar-left" className="flex items-center gap-3">
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

/** Phone bar: menu button, name, account and language, then the menus, then the diagram name. */
export const MobileNavbar: React.FC<MobileNavbarProps> = ({
    commands,
    railOpen,
    onToggleRail,
}) => {
    const { t } = useTranslation();
    return (
        <header className="relative z-10 shrink-0 border-b bg-background/80 backdrop-blur">
            <div className="flex h-12 items-center justify-between px-2">
                <div className="flex items-center gap-2">
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
                    <Logo />
                </div>
                <Slot name="navbar-right" className="flex items-center gap-1">
                    <AccountMenu />
                    <LanguageButton />
                </Slot>
            </div>
            <div className="overflow-x-auto px-2 pb-1">
                <Menus commands={commands} />
            </div>
            {/* the phone layout shows these too (SHL-069) */}
            <div className="flex items-center gap-2 overflow-x-auto px-2 pb-1">
                <SaveAndPublishControls />
            </div>
            <div className="flex justify-center px-2 pb-2">
                <DiagramName />
            </div>
        </header>
    );
};
