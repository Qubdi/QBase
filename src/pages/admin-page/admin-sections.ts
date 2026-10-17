// The admin panel's sections. Plain data, no React, so the router can use it
// without pulling the admin page into the main bundle.

export interface AdminSectionInfo {
    id: string;
    label: string;
    /** one line under the section's title */
    description: string;
}

export const ADMIN_SECTIONS = [
    {
        id: 'overview',
        label: 'Overview',
        description:
            'Totals for users, projects, diagrams and share links, and the latest activity.',
    },
    {
        id: 'projects',
        label: 'Projects',
        description:
            'Organise diagrams into projects and choose who can access each one.',
    },
    {
        id: 'users',
        label: 'Users',
        description:
            'Create users, choose who is an admin, and turn accounts on or off.',
    },
    {
        id: 'diagrams',
        label: 'Diagrams',
        description:
            'Every diagram with its project, owner and share links, so a link can be revoked.',
    },
    {
        id: 'activity',
        label: 'Activity',
        description:
            'Who did what and when, newest first: publishes, share links and changes to users and projects.',
    },
] as const satisfies readonly AdminSectionInfo[];

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id'];

export const ADMIN_SECTION_IDS = ADMIN_SECTIONS.map((s) => s.id);

/**
 * Where `/admin` goes: the Overview, where an admin starts.
 */
export const DEFAULT_ADMIN_SECTION: AdminSectionId = 'overview';

export const adminPath = (id: AdminSectionId) => `/admin/${id}`;

/** The section a path belongs to, or undefined for anything else. */
export function sectionForPath(
    pathname: string
): (typeof ADMIN_SECTIONS)[number] | undefined {
    return ADMIN_SECTIONS.find(
        (s) =>
            pathname === adminPath(s.id) ||
            pathname.startsWith(`${adminPath(s.id)}/`)
    );
}
