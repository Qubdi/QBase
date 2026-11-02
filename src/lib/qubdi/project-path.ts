// URLs of a project's workspace: /Qubdi/diagrams and /Qubdi/diagrams/<id>.

export const projectHomePath = (slug: string): string =>
    `/${encodeURIComponent(slug)}/diagrams`;

/** A diagram inside a project, addressed by its server id. */
export const projectDiagramPath = (slug: string, remoteId: string): string =>
    `${projectHomePath(slug)}/${remoteId}`;

const decode = (value: string): string => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

/** Finds a project by the slug in the URL; case does not matter. */
export function findProjectBySlug<T extends { slug: string }>(
    projects: T[],
    param: string | undefined
): T | undefined {
    if (!param) return undefined;
    const want = decode(param).toLowerCase();
    return projects.find((p) => p.slug.toLowerCase() === want);
}
