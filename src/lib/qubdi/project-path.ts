// URLs of a project's workspace: /Qubdi/diagrams and /Qubdi/diagrams/<id>.

export const projectHomePath = (slug: string): string =>
    `/${encodeURIComponent(slug)}/diagrams`;

/** A diagram inside a project, addressed by its server id. */
export const projectDiagramPath = (slug: string, remoteId: string): string =>
    `${projectHomePath(slug)}/${remoteId}`;
