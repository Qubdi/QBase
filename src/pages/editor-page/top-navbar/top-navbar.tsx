import React from 'react';
import { AccountMenu } from '@/components/qubdi/account-menu';
import { PublishControl } from '@/components/qubdi/publish-control';
import { CommentsControl } from '@/components/qubdi/comments-control';
import { DriftControl } from '@/components/qubdi/drift-control';
import { LintControl } from '@/components/qubdi/lint-control';
import { DiagramName } from './diagram-name';
import { LastSaved } from './last-saved';
import { LanguageNav } from './language-nav/language-nav';
import { Menu } from './menu/menu';

export interface TopNavbarProps {}

export const TopNavbar: React.FC<TopNavbarProps> = () => {
    return (
        <nav className="flex flex-col justify-between border-b bg-background/80 px-3 shadow-sm backdrop-blur md:h-12 md:flex-row md:items-center md:px-4">
            <div className="flex flex-1 flex-col justify-between gap-x-1 md:flex-row md:justify-normal">
                <div className="flex items-center justify-between pt-[8px] font-primary md:py-[10px]">
                    <span
                        className="flex cursor-default items-center gap-2 text-lg font-semibold tracking-tight"
                        data-testid="brand"
                    >
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                            className="text-primary"
                        >
                            <ellipse
                                cx="12"
                                cy="6"
                                rx="8"
                                ry="3"
                                stroke="currentColor"
                                strokeWidth="2"
                            />
                            <path
                                d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"
                                stroke="currentColor"
                                strokeWidth="2"
                            />
                            <path
                                d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"
                                stroke="currentColor"
                                strokeWidth="2"
                            />
                        </svg>
                        <span>
                            Qubdi<span className="text-primary">DB</span>
                        </span>
                    </span>
                </div>
                <Menu />
            </div>
            <DiagramName />
            <div className="hidden flex-1 items-center justify-end gap-2 sm:flex">
                <LastSaved />
                <LintControl />
                <DriftControl />
                <CommentsControl />
                <PublishControl />
                <AccountMenu />
                <LanguageNav />
            </div>
        </nav>
    );
};
