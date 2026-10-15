import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { AuthDialog } from './auth-dialog';
import { ChangePasswordDialog } from './change-password-dialog';

/**
 * Frame for the pages outside the editor (projects, diagrams of a project).
 * They need a signed-in user, so it handles loading and the sign-in prompt.
 */
export const AppShell: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { enabled, user, logout } = useQubdi();
    const navigate = useNavigate();
    const [authOpen, setAuthOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);

    return (
        <section className="flex min-h-screen w-screen flex-col bg-background">
            <nav className="flex h-12 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
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
                                Admin
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
                                    {user.isAdmin ? ' (admin)' : ''}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => setPasswordOpen(true)}
                                >
                                    <KeyRound className="mr-2 size-4" />
                                    Change password
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void logout()}>
                                    <LogOut className="mr-2 size-4" />
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ) : null}
            </nav>

            {!enabled ? (
                <p className="mx-auto mt-24 max-w-sm px-4 text-center text-muted-foreground">
                    Projects need a QubdiDB server. Set VITE_QUBDI_BACKEND_URL
                    and sign in to use them.
                </p>
            ) : user === undefined ? (
                <Spinner size="large" className="mx-auto mt-24 text-primary" />
            ) : user === null ? (
                <div className="mx-auto mt-24 flex max-w-sm flex-col items-center gap-3 px-4 text-center">
                    <p className="text-sm text-muted-foreground">
                        Sign in to see your projects. Accounts are created by an
                        admin.
                    </p>
                    <Button onClick={() => setAuthOpen(true)}>Sign in</Button>
                    <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
                </div>
            ) : (
                children
            )}
            <ChangePasswordDialog
                open={passwordOpen}
                onOpenChange={setPasswordOpen}
            />
        </section>
    );
};
