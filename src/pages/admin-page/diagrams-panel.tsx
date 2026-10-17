import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
                        placeholder="Search diagrams by title…"
                        label="Search diagrams"
                    />
                    <div className="sm:w-60">
                        <ProjectFilter value={project} onChange={setProject} />
                    </div>
                </div>

                <div className="max-h-[26rem] min-h-40 overflow-auto [&_td]:px-2.5 [&_th]:px-2.5">
                    <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow>
                                <TableHead>Diagram</TableHead>
                                <TableHead>Project</TableHead>
                                <TableHead>Owner</TableHead>
                                <TableHead>Updated</TableHead>
                                <TableHead>Published</TableHead>
                                <TableHead>Editing</TableHead>
                                <TableHead className="text-right">
                                    Share links
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
                                        Loading…
                                    </TableCell>
                                </TableRow>
                            ) : list.items.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-muted-foreground"
                                    >
                                        {list.query
                                            ? `No diagram's title matches "${list.query}"${project ? ` in ${project.name}` : ''}.`
                                            : project
                                              ? `${project.name} has no diagrams.`
                                              : 'There are no diagrams yet.'}
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
                                                    title="Open in the editor"
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
                                                <Dash label="Unknown" />
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-48 truncate">
                                            {d.ownerEmail ?? (
                                                <Dash label="Deleted user" />
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
                                                <Dash label="Never" />
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-48 truncate">
                                            {d.editingBy ? (
                                                (d.editingBy.email ?? (
                                                    <Dash label="Someone" />
                                                ))
                                            ) : (
                                                <Dash label="No one" />
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {d.activeLinks > 0 ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    aria-label={`Share links of ${d.title}: ${d.activeLinks} active`}
                                                    onClick={() =>
                                                        setLinksFor(d)
                                                    }
                                                >
                                                    {d.activeLinks} active
                                                </Button>
                                            ) : (
                                                <Dash label="None" />
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
                    noun="diagrams"
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
