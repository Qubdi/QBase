import React from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import {
    ADMIN_SECTION_IDS,
    DEFAULT_ADMIN_SECTION,
    adminPath,
} from './admin-sections';

/**
 * `/admin` and one child route per section. The sections are listed as fixed
 * paths on purpose, not as `/admin/:section`: the editor has a
 * `:projectSlug/diagrams` route, and a parameter here would tie with it, so
 * `/admin/diagrams` could be taken for a project called "admin".
 */
export const adminRoute: RouteObject = {
    path: 'admin',
    async lazy() {
        const { AdminPage } = await import('./admin-page');
        return { element: <AdminPage /> };
    },
    children: [
        {
            index: true,
            element: <Navigate to={adminPath(DEFAULT_ADMIN_SECTION)} replace />,
        },
        ...ADMIN_SECTION_IDS.map((id): RouteObject => ({
            path: id,
            async lazy() {
                const { AdminSection } = await import('./admin-section');
                return { element: <AdminSection id={id} /> };
            },
        })),
    ],
};
