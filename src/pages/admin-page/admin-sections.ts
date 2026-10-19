// The admin panel's sections. Plain data, no React, so the router can use it
// without pulling the admin page into the main bundle.

import { i18n } from '@/i18n/i18n';

export interface AdminSectionInfo {
    id: string;
    /** read when rendered, so a language change applies */
    readonly label: string;
    /** one line under the section's title */
    readonly description: string;
}

const section = <Id extends string>(id: Id): AdminSectionInfo & { id: Id } => ({
    id,
    get label() {
        return i18n.t(`qubdi.adminUsers.sections.${id}.label`);
    },
    get description() {
        return i18n.t(`qubdi.adminUsers.sections.${id}.description`);
    },
});

export const ADMIN_SECTIONS = [
    section('overview'),
    section('projects'),
    section('users'),
    section('diagrams'),
    section('activity'),
] as const;

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
