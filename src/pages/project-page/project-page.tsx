import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Database, Plus } from 'lucide-react';
import { Badge } from '@/components/badge/badge';
import { Button } from '@/components/button/button';
import { AppShell } from '@/components/qubdi/app-shell';
import { ImportFromDatabaseDialog } from '@/components/qubdi/import-from-database-dialog';
import { NewDiagramDialog } from '@/components/qubdi/new-diagram-dialog';
import { ProjectDiagrams } from '@/components/qubdi/project-diagrams';
import { Spinner } from '@/components/spinner/spinner';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { StorageProvider } from '@/context/storage-context/storage-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import {
    api,
    errorMessage,
    type MyProject,
    type RemoteDiagramSummary,
} from '@/lib/qubdi/api';

type State =
    | { kind: 'loading' }
    | { kind: 'missing' }
    | {
          kind: 'ok';
          project: MyProject;
          diagrams: RemoteDiagramSummary[];
      };

const roleLabel = (role: MyProject['role']) =>
    role === 'owner' ? 'Admin' : role === 'editor' ? 'Editor' : 'Viewer';

const ProjectView: React.FC = () => {
    const { projectId = '' } = useParams<{ projectId: string }>();
    const [state, setState] = useState<State>({ kind: 'loading' });
    const [error, setError] = useState<string | null>(null);
    const [newOpen, setNewOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);

    useEffect(() => {
        setState({ kind: 'loading' });
        Promise.all([api.listProjects(), api.listDiagrams()])
            .then(([projects, diagrams]) => {
                const project = projects.find((p) => p.id === projectId);
                setState(
                    project
                        ? {
                              kind: 'ok',
                              project,
                              diagrams: diagrams.filter(
                                  (d) => d.projectId === projectId
                              ),
                          }
                        : { kind: 'missing' }
                );
            })
            .catch((e) => {
                setError(errorMessage(e));
                setState({ kind: 'missing' });
            });
    }, [projectId]);

    if (state.kind === 'loading') {
        return <Spinner size="large" className="mx-auto mt-24 text-primary" />;
    }

    if (state.kind === 'missing') {
        return (
            <main className="mx-auto mt-24 max-w-sm px-4 text-center">
                <p className="font-medium">Project not found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    {error ??
                        'It does not exist, or you have not been added to it.'}
                </p>
                <Button asChild variant="outline" className="mt-4">
                    <Link to="/">Back to projects</Link>
                </Button>
            </main>
        );
    }

    const { project, diagrams } = state;
    const canEdit = project.role !== 'viewer';

    return (
        <main className="mx-auto w-full max-w-5xl px-4 py-8">
            <Link
                to="/"
                className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="size-4" />
                All projects
            </Link>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="font-primary text-2xl font-bold">
                            {project.name}
                        </h1>
                        <Badge variant="secondary">
                            {roleLabel(project.role)}
                        </Badge>
                    </div>
                    {project.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                            {project.description}
                        </p>
                    ) : null}
                </div>
                {canEdit ? (
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="gap-1"
                            onClick={() => setImportOpen(true)}
                        >
                            <Database className="size-4" />
                            Import from database
                        </Button>
                        <Button
                            className="gap-1"
                            onClick={() => setNewOpen(true)}
                        >
                            <Plus className="size-4" />
                            New diagram
                        </Button>
                    </div>
                ) : null}
            </div>
            {!canEdit ? (
                <p className="mb-4 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                    You have view-only access. Ask an admin for the Editor role
                    to create or change diagrams.
                </p>
            ) : null}
            <ProjectDiagrams diagrams={diagrams} />
            {canEdit ? (
                <>
                    <NewDiagramDialog
                        open={newOpen}
                        onOpenChange={setNewOpen}
                        projectId={project.id}
                        projectName={project.name}
                    />
                    <ImportFromDatabaseDialog
                        open={importOpen}
                        onOpenChange={setImportOpen}
                        projectId={project.id}
                    />
                </>
            ) : null}
        </main>
    );
};

export const ProjectPage: React.FC = () => (
    <LocalConfigProvider>
        <StorageProvider>
            <ThemeProvider>
                <Helmet>
                    <title>QubdiDB - Project</title>
                </Helmet>
                <AppShell>
                    <ProjectView />
                </AppShell>
            </ThemeProvider>
        </StorageProvider>
    </LocalConfigProvider>
);
