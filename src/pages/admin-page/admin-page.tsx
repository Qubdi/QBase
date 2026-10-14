import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Logo } from '@/components/logo/logo';
import { Spinner } from '@/components/spinner/spinner';
import { Button } from '@/components/button/button';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/tabs/tabs';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { useQubdi } from '@/hooks/use-qubdi';
import { ProjectsPanel } from './projects-panel';
import { UsersPanel } from './users-panel';

const Shell: React.FC<React.PropsWithChildren> = ({ children }) => (
    <section className="flex min-h-screen w-screen flex-col bg-background">
        <Helmet>
            <title>QubdiDB - Admin</title>
        </Helmet>
        <nav className="flex h-12 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
            <Link to="/" className="flex h-full items-center">
                <Logo />
            </Link>
            <Button asChild variant="outline" size="sm">
                <Link to="/">Back to editor</Link>
            </Button>
        </nav>
        {children}
    </section>
);

const AdminContent: React.FC = () => {
    const { enabled, user } = useQubdi();

    if (user === undefined && enabled) {
        return (
            <Shell>
                <Spinner size="large" className="mx-auto mt-20 text-primary" />
            </Shell>
        );
    }

    // anyone who is not an admin sees the same page as a missing route
    if (!enabled || !user?.isAdmin) {
        return (
            <Shell>
                <div className="mx-auto mt-24 max-w-sm text-center">
                    <h1 className="font-primary text-5xl font-extrabold text-primary">
                        404
                    </h1>
                    <p className="mt-3 text-muted-foreground">
                        Sorry, we can&apos;t find that page.
                    </p>
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            <main className="mx-auto w-full max-w-5xl px-4 py-8">
                <h1 className="font-primary text-2xl font-bold">Admin</h1>
                <p className="mb-6 text-sm text-muted-foreground">
                    Create users, organise diagrams into projects, and choose
                    who can access each project.
                </p>
                <Tabs defaultValue="projects">
                    <TabsList>
                        <TabsTrigger value="projects">Projects</TabsTrigger>
                        <TabsTrigger value="users">Users</TabsTrigger>
                    </TabsList>
                    <TabsContent value="projects" className="mt-6">
                        <ProjectsPanel />
                    </TabsContent>
                    <TabsContent value="users" className="mt-6">
                        <UsersPanel currentUserId={user.id} />
                    </TabsContent>
                </Tabs>
            </main>
        </Shell>
    );
};

export const AdminPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <AdminContent />
        </ThemeProvider>
    </LocalConfigProvider>
);
