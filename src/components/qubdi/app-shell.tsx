import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import { Logo } from '@/components/logo/logo';
import { Spinner } from '@/components/spinner/spinner';
import { useQubdi } from '@/hooks/use-qubdi';
import { ChangePasswordDialog } from './change-password-dialog';
import { PageFooter } from './powered-by';
import { SessionEndedNotice } from './session-ended-notice';
import { SignInPrompt } from './sign-in-prompt';

/**
 * Frame for the pages outside the editor (projects, diagrams of a project).
 * They need a signed-in user, so it handles loading and the sign-in prompt.
 */
export const AppShell: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { t } = useTranslation();
    const { enabled, user, logout } = useQubdi();
    const navigate = useNavigate();
    const [passwordOpen, setPasswordOpen] = useState(false);

    return (
        <section className="flex min-h-screen w-screen flex-col bg-background">
            <nav className="flex h-12 items-center justify-between bg-background/80 px-4 backdrop-blur">
                <Link to="/" className="flex h-full items-center">
                    <Logo />
                </Link>
                {user ? (
                    <div className="flex items-center gap-2">
                        {user.isAdmin ? (
                            <Button
                                variant="secondary"
                                size="sm"
                                className="gap-1"
                                onClick={() => navigate('/admin')}
                            >
                                <ShieldCheck className="size-4" />
                                {t('qubdi.account.accountMenu.admin')}
                            </Button>
                        ) : null}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                >
                                    <UserRound className="size-4" />
                                    <span className="max-w-40 truncate">
                                        {user.email}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>
                                    {user.email}
                                    {user.isAdmin
                                        ? t(
                                              'qubdi.account.accountMenu.adminSuffix'
                                          )
                                        : ''}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => setPasswordOpen(true)}
                                >
                                    <KeyRound className="mr-2 size-4" />
                                    {t(
                                        'qubdi.account.accountMenu.changePassword'
                                    )}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void logout()}>
                                    <LogOut className="mr-2 size-4" />
                                    {t('qubdi.account.accountMenu.signOut')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ) : null}
            </nav>

            {!enabled ? (
                <p className="m-auto max-w-sm px-4 text-center text-muted-foreground">
                    {t('qubdi.account.appShell.needsServer')}
                </p>
            ) : user === undefined ? (
                <Spinner size="large" className="m-auto text-primary" />
            ) : user === null ? (
                <div className="m-auto flex max-w-sm flex-col items-center gap-3 px-4 text-center">
                    <SessionEndedNotice />
                    <SignInPrompt verb="see" />
                </div>
            ) : (
                children
            )}
            <PageFooter />
            <ChangePasswordDialog
                open={passwordOpen}
                onOpenChange={setPasswordOpen}
            />
        </section>
    );
};
