import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { FolderKanban } from 'lucide-react';
import { Badge } from '@/components/badge/badge';
import { AdminLandingRedirect } from '@/components/qubdi/admin-landing-redirect';
import { AppShell } from '@/components/qubdi/app-shell';
import { Spinner } from '@/components/spinner/spinner';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { StorageProvider } from '@/context/storage-context/storage-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { useQubdi } from '@/hooks/use-qubdi';
import { api, errorMessage, type MyProject } from '@/lib/qubdi/api';
import { projectHomePath } from '@/lib/qubdi/project-path';

const roleLabel = (role: MyProject['role']) =>
    role === 'owner' ? 'Admin' : role === 'editor' ? 'Editor' : 'Viewer';

const Projects: React.FC = () => {
    const { user } = useQubdi();
    const [projects, setProjects] = useState<MyProject[] | null>(null);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([api.listProjects(), api.listDiagrams()])
            .then(([list, diagrams]) => {
                setProjects(list);
                const byProject: Record<string, number> = {};
                for (const d of diagrams) {
                    if (d.projectId) {
                        byProject[d.projectId] =
                            (byProject[d.projectId] ?? 0) + 1;
                    }
                }
                setCounts(byProject);
            })
            .catch((e) => {
                setError(errorMessage(e));
                setProjects([]);
            });
    }, []);

    return (
        <main className="mx-auto w-full max-w-5xl px-4 py-8">
            <h1 className="font-primary text-2xl font-bold">Projects</h1>
            <p className="mb-6 text-sm text-muted-foreground">
                Each project is its own workspace. Open one to work on its
                database diagrams.
            </p>
            {error ? (
                <p role="alert" className="mb-4 text-sm text-destructive">
                    {error}
                </p>
            ) : null}
            {projects === null ? (
                <Spinner size="large" className="mx-auto mt-12 text-primary" />
            ) : projects.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center">
                    <FolderKanban className="mx-auto mb-3 size-8 text-muted-foreground" />
                    <p className="font-medium">No projects yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {user?.isAdmin ? (
                            <>
                                Create the first project in the{' '}
                                <Link
                                    to="/admin"
                                    className="text-primary underline"
                                >
                                    admin panel
                                </Link>
                                .
                            </>
                        ) : (
                            'You are not assigned to any project yet. Ask an admin to add you to one.'
                        )}
                    </p>
                </div>
            ) : (
                <ul
                    className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    aria-label="Projects"
                >
                    {projects.map((p) => (
                        <li key={p.id}>
                            <Link
                                to={projectHomePath(p.slug)}
                                className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="font-primary text-base font-semibold">
                                        {p.name}
                                    </span>
                                    <Badge variant="secondary">
                                        {roleLabel(p.role)}
                                    </Badge>
                                </div>
                                {p.description ? (
                                    <p className="line-clamp-2 text-sm text-muted-foreground">
                                        {p.description}
                                    </p>
                                ) : null}
                                <p className="mt-auto pt-2 text-xs text-muted-foreground">
                                    {counts[p.id] ?? 0} diagram
                                    {(counts[p.id] ?? 0) === 1 ? '' : 's'}
                                </p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
};

export const HomePage: React.FC = () => (
    <LocalConfigProvider>
        <StorageProvider>
            <ThemeProvider>
                <Helmet>
                    <title>QubdiDB - Projects</title>
                </Helmet>
                {/* admins start on the admin panel, once per session */}
                <AdminLandingRedirect />
                <AppShell>
                    <Projects />
                </AppShell>
            </ThemeProvider>
        </StorageProvider>
    </LocalConfigProvider>
);
