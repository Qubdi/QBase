import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Logo } from '@/components/logo/logo';
import { Spinner } from '@/components/spinner/spinner';
import { Button } from '@/components/button/button';
import { Toaster } from '@/components/toast/toaster';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { useQubdi } from '@/hooks/use-qubdi';
import { PageFooter } from '@/components/qubdi/powered-by';
import { AdminNav } from './admin-nav';
import { sectionForPath } from './admin-sections';

const Shell: React.FC<React.PropsWithChildren<{ title?: string }>> = ({
    title,
    children,
}) => {
    const { t } = useTranslation();
    return (
        <section className="flex min-h-screen w-full flex-col bg-background">
            <Helmet>
                <title>
                    {title
                        ? t('qubdi.adminUsers.shell.titleWithSection', {
                              section: title,
                          })
                        : t('qubdi.adminUsers.shell.title')}
                </title>
            </Helmet>
            <nav className="flex h-12 items-center justify-between bg-background/80 px-4 backdrop-blur">
                <Link to="/" className="flex h-full items-center">
                    <Logo />
                </Link>
                <Button asChild variant="outline" size="sm">
                    <Link to="/">
                        {t('qubdi.adminUsers.shell.backToEditor')}
                    </Link>
                </Button>
            </nav>
            {children}
            <PageFooter />
            <Toaster />
        </section>
    );
};

/**
 * The admin panel's frame: the sections on the left (a row on small screens),
 * the section's title, and the section itself in the outlet.
 */
export const AdminLayout: React.FC = () => {
    const { t } = useTranslation();
    const { enabled, user } = useQubdi();
    const { pathname } = useLocation();
    const section = sectionForPath(pathname);

    if (user === undefined && enabled) {
        return (
            <Shell>
                <Spinner size="large" className="m-auto text-primary" />
            </Shell>
        );
    }

    // anyone who is not an admin sees the same page as a missing route
    if (!enabled || !user?.isAdmin) {
        return (
            <Shell>
                <div className="m-auto max-w-sm text-center">
                    <h1 className="font-primary text-5xl font-extrabold text-primary">
                        404
                    </h1>
                    <p className="mt-3 text-muted-foreground">
                        {t('qubdi.adminUsers.shell.notFound')}
                    </p>
                </div>
            </Shell>
        );
    }

    return (
        <Shell title={section?.label}>
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:py-8">
                <AdminNav />
                <main className="min-w-0 max-w-5xl flex-1">
                    {section ? (
                        <header className="mb-6">
                            <h1 className="font-primary text-2xl font-bold">
                                {section.label}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {section.description}
                            </p>
                        </header>
                    ) : null}
                    <Outlet />
                </main>
            </div>
        </Shell>
    );
};

export const AdminPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <AdminLayout />
        </ThemeProvider>
    </LocalConfigProvider>
);
