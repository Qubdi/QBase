import React from 'react';
import {
    createBrowserRouter,
    type RouteObject,
    type RouterProviderProps,
} from 'react-router-dom';
import { adminRoute } from '@/pages/admin-page/admin-route';
import { BACKEND_ENABLED } from '@/platform/config/backend';
import { RouteError } from './problem-page';
import { RouteFallback } from './route-fallback';

type Loader<T> = () => Promise<T>;

/** A route whose page code is fetched the first time the path is visited. */
const lazyPage = <M,>(
    path: string,
    load: Loader<M>,
    pick: (module: M) => React.ReactElement
): RouteObject => ({
    path,
    HydrateFallback: RouteFallback,
    // a page that fails to load or to draw shows a message, not a blank screen
    errorElement: <RouteError />,
    async lazy() {
        return { element: pick(await load()) };
    },
});

const editor = (path: string) =>
    lazyPage(
        path,
        () => import('@/workspace/editor-page'),
        (m) => <m.EditorPage />
    );

const shareViewer = lazyPage(
    's/:token',
    () => import('@/pages/share-viewer-page/share-viewer-page'),
    (m) => <m.ShareViewerPage />
);

const notFound = lazyPage(
    '*',
    () => import('./not-found-page'),
    (m) => <m.NotFoundPage />
);

/**
 * The route table (spec A2). With a backend, nothing exists outside a project,
 * so the example and template pages are left out. The not-found route is
 * always last.
 */
export const buildRoutes = (backendEnabled: boolean): RouteObject[] =>
    backendEnabled
        ? [
              lazyPage(
                  '',
                  () => import('@/pages/home-page/home-page'),
                  (m) => <m.HomePage />
              ),
              editor(':projectSlug/diagrams'),
              editor(':projectSlug/diagrams/:remoteDiagramId'),
              editor('diagrams/:diagramId'),
              adminRoute,
              shareViewer,
              notFound,
          ]
        : [
              editor(''),
              editor('diagrams/:diagramId'),
              adminRoute,
              shareViewer,
              notFound,
          ];

export const createAppRouter = (
    backendEnabled: boolean = BACKEND_ENABLED
): RouterProviderProps['router'] =>
    createBrowserRouter(buildRoutes(backendEnabled));
