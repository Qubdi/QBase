import React from 'react';
import { AccountMenu } from '@/components/qubdi/account-menu';
import { PublishControl } from '@/components/qubdi/publish-control';
import { DriftControl } from '@/components/qubdi/drift-control';
import { GetLatestControl } from '@/components/qubdi/get-latest-control';
import { LintControl } from '@/components/qubdi/lint-control';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/logo/logo';
import { ServerSaveStatus } from '@/components/qubdi/server-autosave';
import { DiagramName } from './diagram-name';
import { LastSaved } from './last-saved';
import { LanguageNav } from './language-nav/language-nav';
import { Menu } from './menu/menu';

export interface TopNavbarProps {}

export const TopNavbar: React.FC<TopNavbarProps> = () => {
    return (
        <nav className="flex flex-col justify-between border-b bg-background/80 px-3 shadow-sm backdrop-blur md:h-12 md:flex-row md:items-center md:px-4">
            <div className="flex flex-1 flex-col justify-between md:flex-row md:items-center md:justify-normal md:gap-x-3">
                <div className="flex h-10 items-center justify-between font-primary md:h-12">
                    <Link to="/" className="flex h-full items-center">
                        <Logo />
                    </Link>
                </div>
                <Menu />
            </div>
            <DiagramName />
            <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
                <ServerSaveStatus fallback={<LastSaved />} />
                <GetLatestControl />
                <LintControl />
                <DriftControl />
                <PublishControl />
                <AccountMenu />
                <LanguageNav />
            </div>
        </nav>
    );
};
