import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/badge/badge';
import { Button } from '@/components/button/button';
import { ListPager } from '@/components/qubdi/list-pager';
import { SearchInput } from '@/components/qubdi/search-input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/table/table';
import { usePagedList } from '@/hooks/use-paged-list';
import { api, type AdminDiagram } from '@/lib/qubdi/api';
import { projectDiagramPath } from '@/lib/qubdi/project-path';
import { ago, exactTime } from '@/lib/qubdi/when';
import { DiagramLinksDialog } from './diagram-links-dialog';
import { ProjectFilter, type ChosenProject } from './project-filter';

const PAGE_SIZE = 10;

const Dash: React.FC<{ label: string }> = ({ label }) => (
    <span className="text-muted-foreground">{label}</span>
);

/** Every diagram, with where it lives, who owns it and who is sharing it. */
export const DiagramsPanel: React.FC = () => {
    const { t } = useTranslation();
    const [project, setProject] = useState<ChosenProject | null>(null);
    const [linksFor, setLinksFor] = useState<AdminDiagram | null>(null);

    const list = usePagedList(
        ({ page, limit, q, filter }) =>
            api.adminListDiagrams({
                page,
                limit,
                q,
                projectId: filter || undefined,
            }),
        { limit: PAGE_SIZE, filter: project?.id ?? '' }
    );

    return (
        <div className="flex flex-col gap-3">
            {list.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {list.error}
                </p>
            ) : null}

            <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 shadow-xs">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <SearchInput
                        className="flex-1"
                        value={list.query}
                        onChange={list.setQuery}
                        placeholder={t(
                            'qubdi.adminProjects.diagrams.searchPlaceholder'
                        )}
                        label={t('qubdi.adminProjects.diagrams.searchLabel')}
                    />
                    <div className="sm:w-60">
                        <ProjectFilter value={project} onChange={setProject} />
                    </div>
                </div>

                <div className="max-h-[26rem] min-h-40 overflow-auto [&_td]:px-2.5 [&_th]:px-2.5">
                    <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow>
                                <TableHead>
                                    {t(
                                        'qubdi.adminProjects.diagrams.colDiagram'
                                    )}
                                </TableHead>
                                <TableHead>
                                    {t(
                                        'qubdi.adminProjects.diagrams.colProject'
                                    )}
                                </TableHead>
                                <TableHead>
                                    {t('qubdi.adminProjects.diagrams.colOwner')}
                                </TableHead>
                                <TableHead>
                                    {t(
                                        'qubdi.adminProjects.diagrams.colUpdated'
                                    )}
                                </TableHead>
                                <TableHead>
                                    {t(
                                        'qubdi.adminProjects.diagrams.colPublished'
                                    )}
                                </TableHead>
                                <TableHead>
                                    {t(
                                        'qubdi.adminProjects.diagrams.colEditing'
                                    )}
                                </TableHead>
                                <TableHead className="text-right">
                                    {t(
                                        'qubdi.adminProjects.diagrams.colShareLinks'
                                    )}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {list.initialLoading ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-muted-foreground"
                                    >
                                        {t(
                                            'qubdi.adminProjects.diagrams.loading'
                                        )}
                                    </TableCell>
                                </TableRow>
                            ) : list.items.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-muted-foreground"
                                    >
                                        {list.query
                                            ? project
                                                ? t(
                                                      'qubdi.adminProjects.diagrams.noMatchInProject',
                                                      {
                                                          query: list.query,
                                                          project: project.name,
                                                      }
                                                  )
                                                : t(
                                                      'qubdi.adminProjects.diagrams.noMatch',
                                                      {
                                                          query: list.query,
                                                      }
                                                  )
                                            : project
                                              ? t(
                                                    'qubdi.adminProjects.diagrams.projectEmpty',
                                                    {
                                                        project: project.name,
                                                    }
                                                )
                                              : t(
                                                    'qubdi.adminProjects.diagrams.none'
                                                )}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                list.items.map((d) => (
                                    <TableRow key={d.id}>
                                        <TableCell className="max-w-56 font-medium">
                                            {d.projectSlug ? (
                                                <Link
                                                    to={projectDiagramPath(
                                                        d.projectSlug,
                                                        d.id
                                                    )}
                                                    className="block truncate underline-offset-2 hover:underline"
                                                    title={t(
                                                        'qubdi.adminProjects.diagrams.openInEditor'
                                                    )}
                                                >
                                                    {d.title}
                                                </Link>
                                            ) : (
                                                <span className="block truncate">
                                                    {d.title}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-40 truncate">
                                            {d.projectName ?? (
                                                <Dash
                                                    label={t(
                                                        'qubdi.adminProjects.diagrams.unknown'
                                                    )}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-48 truncate">
                                            {d.ownerEmail ?? (
                                                <Dash
                                                    label={t(
                                                        'qubdi.adminProjects.diagrams.deletedUser'
                                                    )}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <time
                                                dateTime={d.updatedAt}
                                                title={exactTime(d.updatedAt)}
                                            >
                                                {ago(d.updatedAt)}
                                            </time>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {d.publishedVersion !== null ? (
                                                <Badge variant="secondary">
                                                    v{d.publishedVersion}
                                                </Badge>
                                            ) : (
                                                <Dash
                                                    label={t(
                                                        'qubdi.adminProjects.diagrams.never'
                                                    )}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-48 truncate">
                                            {d.editingBy ? (
                                                (d.editingBy.email ?? (
                                                    <Dash
                                                        label={t(
                                                            'qubdi.adminProjects.diagrams.someone'
                                                        )}
                                                    />
                                                ))
                                            ) : (
                                                <Dash
                                                    label={t(
                                                        'qubdi.adminProjects.diagrams.noOne'
                                                    )}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {d.activeLinks > 0 ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    aria-label={t(
                                                        'qubdi.adminProjects.diagrams.linksLabel',
                                                        {
                                                            title: d.title,
                                                            count: d.activeLinks,
                                                        }
                                                    )}
                                                    onClick={() =>
                                                        setLinksFor(d)
                                                    }
                                                >
                                                    {t(
                                                        'qubdi.adminProjects.diagrams.linksActive',
                                                        {
                                                            count: d.activeLinks,
                                                        }
                                                    )}
                                                </Button>
                                            ) : (
                                                <Dash
                                                    label={t(
                                                        'qubdi.adminProjects.diagrams.linksNone'
                                                    )}
                                                />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <ListPager
                    page={list.page}
                    pageCount={list.pageCount}
                    limit={list.limit}
                    total={list.total}
                    onPageChange={list.setPage}
                    disabled={list.loading}
                    noun={t('qubdi.adminProjects.diagrams.pagerNoun')}
                />
            </div>

            <DiagramLinksDialog
                diagram={linksFor}
                onClose={() => setLinksFor(null)}
                onChanged={list.reload}
            />
        </div>
    );
};
