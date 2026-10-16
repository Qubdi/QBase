import React from 'react';
import { useQubdi } from '@/hooks/use-qubdi';
import type { AdminSectionId } from './admin-sections';
import { ProjectsPanel } from './projects-panel';
import { UsersPanel } from './users-panel';

/** Shown for a section whose page has not been built yet. */
const NotBuilt: React.FC = () => (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        This section is not built yet.
    </div>
);

/** The body of one admin section. The title above it comes from the layout. */
export const AdminSection: React.FC<{ id: AdminSectionId }> = ({ id }) => {
    const { user } = useQubdi();

    switch (id) {
        case 'projects':
            return <ProjectsPanel />;
        case 'users':
            // the layout only renders for an admin, so there is a user
            return user ? <UsersPanel currentUserId={user.id} /> : null;
        default:
            return <NotBuilt />;
    }
};
