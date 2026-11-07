import React from 'react';
import { Spinner } from '@/platform/ui/spinner';

/**
 * What shows while the first page of a visit is being fetched. Without a
 * `HydrateFallback` on the routes, react-router warns on every start.
 */
export const RouteFallback: React.FC = () => (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Spinner size="large" />
    </div>
);
