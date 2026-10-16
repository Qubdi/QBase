import React from 'react';
import { useQubdi } from '@/hooks/use-qubdi';
import type { AdminSectionId } from './admin-sections';
import { ActivityPanel } from './activity-panel';
import { DiagramsPanel } from './diagrams-panel';
import { OverviewPanel } from './overview-panel';
import { ProjectsPanel } from './projects-panel';
import { UsersPanel } from './users-panel';

/**
 * The body of one admin section. The title above it comes from the layout.
 * Every section has a page; adding one to `ADMIN_SECTIONS` without a case
 * here is a type error.
 */
export const AdminSection: React.FC<{ id: AdminSectionId }> = ({ id }) => {
    const { user } = useQubdi();

    switch (id) {
        case 'overview':
            return <OverviewPanel />;
        case 'projects':
            return <ProjectsPanel />;
        case 'users':
            // the layout only renders for an admin, so there is a user
            return user ? <UsersPanel currentUserId={user.id} /> : null;
        case 'diagrams':
            return <DiagramsPanel />;
        case 'activity':
            return <ActivityPanel />;
        default: {
            const unreachable: never = id;
            return unreachable;
        }
    }
};
