import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderPlus, Plus } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/platform/ui/tabs';
import { ToastAction } from '@/platform/toast/toast';
import { useToast } from '@/platform/toast/use-toast';
import { ListPager } from '@/components/qubdi/list-pager';
import { SearchInput } from '@/components/qubdi/search-input';
import { usePagedList } from '@/hooks/use-paged-list';
import { projectHomePath } from '@/lib/qubdi/project-path';
import { cn } from '@/lib/utils';
import {
    api,
    errorMessage,
    type AdminProject,
    type AdminUser,
    type ProjectMember,
    type ProjectRole,
    type ProjectSort,
} from '@/lib/qubdi/api';
import { NewProjectDialog } from './new-project-dialog';
import { ProjectMembers } from './project-members';
import { ProjectSettings } from './project-settings';
import { DEFAULT_PROJECT_SORT, ProjectSortMenu } from './project-sort-menu';

const PAGE_SIZE = 5;

const ROLE_NOUN_KEYS: Record<ProjectRole, string> = {
    viewer: 'roleViewer',
    editor: 'roleEditor',
};

type Toast = Parameters<ReturnType<typeof useToast>['toast']>[0];

export const ProjectsPanel: React.FC = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const roleNoun = (role: ProjectRole) =>
        t(`qubdi.adminProjects.projects.${ROLE_NOUN_KEYS[role]}`);
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // the chosen project can sit on another page or be filtered out of the list
    const [selectedCache, setSelectedCache] = useState<AdminProject | null>(
        null
    );
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [tab, setTab] = useState('members');
    const detail = useRef<HTMLElement>(null);

    // a fixed page size keeps the list the same height however many projects exist
    // the sort travels as the list's extra criterion: a new order starts at page 1
    const [sort, setSort] = useState<ProjectSort>(DEFAULT_PROJECT_SORT);
    const list = usePagedList(
        ({ page, limit, q, filter }) =>
            api.adminListProjects({
                page,
                limit,
                q,
                sort: filter as ProjectSort,
            }),
        { limit: PAGE_SIZE, filter: sort }
    );

    const choose = useCallback((p: AdminProject | null) => {
        setSelectedId(p?.id ?? null);
        setSelectedCache(p);
        // no project open: no members to show
        if (!p) setMembers([]);
        // an error belongs to the project it happened in
        setError(null);
    }, []);

    // the fresh copy from the list wins; the cache covers other pages
    const selected = useMemo(
        () =>
            list.items.find((p) => p.id === selectedId) ??
            (selectedCache?.id === selectedId ? selectedCache : null),
        [list.items, selectedId, selectedCache]
    );

    // Open the first project once the list arrives, and again when the open one
    // is gone (nothing chosen).
    const first = list.items[0];
    if (selectedId === null && first) {
        setSelectedId(first.id);
        setSelectedCache(first);
    }

    const reloadMembers = useCallback(async (id: string | null) => {
        if (!id) {
            setMembers([]);
            return;
        }
        try {
            setMembers(await api.adminListProjectMembers(id));
        } catch (e) {
            setError(errorMessage(e));
        }
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        const id = selectedId;
        void (async () => {
            try {
                setMembers(await api.adminListProjectMembers(id));
            } catch (e) {
                setError(errorMessage(e));
            }
        })();
    }, [selectedId]);

    /**
     * Runs a change, then refreshes the list and the members, and says it worked
     * with a toast. Resolves to whether it worked; a failure is shown in the page.
     */
    const run = async (
        fn: () => Promise<unknown>,
        options: { done?: Toast; reload?: boolean } = {}
    ): Promise<boolean> => {
        const { done, reload = true } = options;
        setError(null);
        setBusy(true);
        try {
            await fn();
            list.reload();
            if (reload) await reloadMembers(selectedId);
            if (done) toast(done);
            return true;
        } catch (e) {
            setError(errorMessage(e));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const open = (p: AdminProject) => {
        choose(p);
        // stacked on a phone, the details are far below the list: bring them up
        if (window.matchMedia?.('(max-width: 767px)').matches) {
            requestAnimationFrame(() =>
                detail.current?.scrollIntoView?.({ block: 'start' })
            );
        }
    };

    const create = async (name: string, description: string) => {
        const p = await api.adminCreateProject({ name, description });
        list.reload();
        choose(p);
        setTab('members');
        toast({
            title: t('qubdi.adminProjects.projects.createdTitle'),
            description: t('qubdi.adminProjects.projects.createdBody', {
                name: p.name,
            }),
        });
    };

    const assign = (
        project: AdminProject,
        user: AdminUser,
        role: ProjectRole
    ) =>
        run(() => api.adminSetProjectMember(project.id, user.id, role), {
            done: {
                title: t('qubdi.adminProjects.projects.addedTitle', {
                    email: user.email,
                }),
                description: t('qubdi.adminProjects.projects.addedBody', {
                    role: roleNoun(role),
                    project: project.name,
                }),
            },
        });

    const changeRole = (
        project: AdminProject,
        member: ProjectMember,
        role: ProjectRole
    ) =>
        run(() => api.adminSetProjectMember(project.id, member.userId, role), {
            done: {
                title: t('qubdi.adminProjects.projects.roleChangedTitle', {
                    email: member.email,
                    role: roleNoun(role),
                }),
            },
        });

    const remove = async (project: AdminProject, member: ProjectMember) => {
        const ok = await run(() =>
            api.adminRemoveProjectMember(project.id, member.userId)
        );
        if (!ok) return;
        toast({
            title: t('qubdi.adminProjects.projects.removedTitle', {
                email: member.email,
            }),
            description: t('qubdi.adminProjects.projects.removedBody', {
                project: project.name,
            }),
            action: (
                <ToastAction
                    altText={t('qubdi.adminProjects.projects.undoAlt', {
                        email: member.email,
                    })}
                    onClick={() =>
                        void run(() =>
                            api.adminSetProjectMember(
                                project.id,
                                member.userId,
                                member.role
                            )
                        )
                    }
                >
                    {t('qubdi.adminProjects.projects.undo')}
                </ToastAction>
            ),
        });
    };

    const save = (project: AdminProject, name: string, description: string) =>
        run(
            async () => {
                const updated = await api.adminUpdateProject(project.id, {
                    name,
                    description,
                });
                // keep the shown copy right when it is not on this page
                setSelectedCache((c) => (c ? { ...c, ...updated } : c));
            },
            { done: { title: t('qubdi.adminProjects.projects.savedTitle') } }
        );

    const deleteProject = (project: AdminProject) =>
        run(
            async () => {
                await api.adminDeleteProject(project.id);
                choose(null);
            },
            {
                // the project is gone, so there is nothing to reload members for
                reload: false,
                done: {
                    title: t('qubdi.adminProjects.projects.deletedTitle'),
                    description: project.name,
                },
            }
        );

    return (
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
            <div className="flex flex-col gap-3">
                <Button onClick={() => setCreating(true)}>
                    <Plus className="mr-1.5 size-4" aria-hidden />
                    {t('qubdi.adminProjects.projects.newProject')}
                </Button>

                {list.error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {list.error}
                    </p>
                ) : null}
                <div className="flex gap-2">
                    <SearchInput
                        className="min-w-0 flex-1"
                        value={list.query}
                        onChange={list.setQuery}
                        placeholder={t(
                            'qubdi.adminProjects.projects.searchPlaceholder'
                        )}
                        label={t('qubdi.adminProjects.projects.searchLabel')}
                    />
                    <ProjectSortMenu value={sort} onChange={setSort} />
                </div>
                <ul
                    className="flex max-h-[22rem] min-h-32 flex-col gap-1 overflow-y-auto"
                    aria-label={t('qubdi.adminProjects.projects.listLabel')}
                    data-testid="project-list"
                >
                    {list.initialLoading ? (
                        <li className="text-sm text-muted-foreground">
                            {t('qubdi.adminProjects.projects.loading')}
                        </li>
                    ) : list.items.length === 0 ? (
                        <li className="text-sm text-muted-foreground">
                            {list.query
                                ? t('qubdi.adminProjects.projects.noMatch', {
                                      query: list.query,
                                  })
                                : t('qubdi.adminProjects.projects.none')}
                        </li>
                    ) : (
                        list.items.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => open(p)}
                                    aria-current={
                                        p.id === selectedId ? 'true' : undefined
                                    }
                                    className={cn(
                                        'flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left text-sm',
                                        p.id === selectedId
                                            ? 'border-primary bg-accent text-accent-foreground'
                                            : 'border-transparent hover:bg-muted'
                                    )}
                                >
                                    <span className="font-medium">
                                        {p.name}
                                    </span>
                                    {p.description ? (
                                        <span className="line-clamp-1 text-xs text-muted-foreground">
                                            {p.description}
                                        </span>
                                    ) : null}
                                    <span className="text-xs text-muted-foreground">
                                        {t(
                                            'qubdi.adminProjects.projects.members',
                                            {
                                                count: p.members,
                                            }
                                        )}{' '}
                                        ·{' '}
                                        {t(
                                            'qubdi.adminProjects.projects.diagrams',
                                            {
                                                count: p.diagrams,
                                            }
                                        )}
                                    </span>
                                </button>
                            </li>
                        ))
                    )}
                </ul>
                <ListPager
                    page={list.page}
                    pageCount={list.pageCount}
                    limit={list.limit}
                    total={list.total}
                    onPageChange={list.setPage}
                    disabled={list.loading}
                    noun={t('qubdi.adminProjects.projects.pagerNoun')}
                />
            </div>

            <div className="flex min-w-0 flex-col gap-4">
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                {selected ? (
                    <section
                        ref={detail}
                        aria-label={t(
                            'qubdi.adminProjects.projects.projectLabel',
                            {
                                name: selected.name,
                            }
                        )}
                        className="scroll-mt-4 rounded-xl border bg-card shadow-xs"
                    >
                        <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                            <div className="min-w-0">
                                <h2 className="truncate font-primary text-lg font-semibold">
                                    {selected.name}
                                </h2>
                                <p className="truncate text-sm text-muted-foreground">
                                    {selected.description ||
                                        t(
                                            'qubdi.adminProjects.projects.noDescription'
                                        )}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    <code>
                                        {projectHomePath(selected.slug)}
                                    </code>{' '}
                                    ·{' '}
                                    {t(
                                        'qubdi.adminProjects.projects.diagrams',
                                        {
                                            count: selected.diagrams,
                                        }
                                    )}
                                </p>
                            </div>
                            <Button
                                asChild
                                type="button"
                                variant="outline"
                                size="sm"
                            >
                                <Link to={projectHomePath(selected.slug)}>
                                    {t(
                                        'qubdi.adminProjects.projects.openWorkspace'
                                    )}
                                </Link>
                            </Button>
                        </header>
                        <Tabs
                            value={tab}
                            onValueChange={setTab}
                            className="p-4"
                        >
                            <TabsList>
                                <TabsTrigger value="members">
                                    {t(
                                        'qubdi.adminProjects.projects.tabMembers'
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="settings">
                                    {t(
                                        'qubdi.adminProjects.projects.tabSettings'
                                    )}
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value="members" className="mt-4">
                                <ProjectMembers
                                    key={selected.id}
                                    members={members}
                                    busy={busy}
                                    onAssign={(user, role) =>
                                        assign(selected, user, role)
                                    }
                                    onChangeRole={(m, role) =>
                                        void changeRole(selected, m, role)
                                    }
                                    onRemove={(m) => void remove(selected, m)}
                                />
                            </TabsContent>
                            <TabsContent value="settings" className="mt-4">
                                <ProjectSettings
                                    project={selected}
                                    busy={busy}
                                    onSave={(name, description) =>
                                        void save(selected, name, description)
                                    }
                                    onDelete={() =>
                                        void deleteProject(selected)
                                    }
                                />
                            </TabsContent>
                        </Tabs>
                    </section>
                ) : list.initialLoading ? null : list.total === 0 &&
                  !list.query ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
                        <FolderPlus
                            className="size-8 text-muted-foreground"
                            aria-hidden
                        />
                        <h2 className="font-primary text-base font-semibold">
                            {t('qubdi.adminProjects.projects.emptyTitle')}
                        </h2>
                        <p className="max-w-sm text-sm text-muted-foreground">
                            {t('qubdi.adminProjects.projects.emptyBody')}
                        </p>
                        <Button onClick={() => setCreating(true)}>
                            {t('qubdi.adminProjects.projects.newProject')}
                        </Button>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t('qubdi.adminProjects.projects.selectPrompt')}
                    </p>
                )}
            </div>

            <NewProjectDialog
                open={creating}
                onOpenChange={setCreating}
                onCreate={create}
            />
        </div>
    );
};
