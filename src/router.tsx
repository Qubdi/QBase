import React from 'react';
import type { RouteObject } from 'react-router-dom';
import { createBrowserRouter } from 'react-router-dom';
import type { TemplatePageLoaderData } from './pages/template-page/template-page';
import type { TemplatesPageLoaderData } from './pages/templates-page/templates-page';
import { getTemplatesAndAllTags } from './templates-data/template-utils';
import { QUBDI_BACKEND_ENABLED } from './lib/qubdi/config';
import { adminRoute } from './pages/admin-page/admin-route';

export const buildRoutes = (backendEnabled: boolean): RouteObject[] => [
    // With a server the home route is the project picker (nothing exists
    // outside a project); in local mode it stays the editor.
    ...(backendEnabled
        ? [
              {
                  path: '',
                  async lazy() {
                      const { HomePage } =
                          await import('./pages/home-page/home-page');
                      return { element: <HomePage /> };
                  },
              },
              // a project's workspace: the editor, scoped to the project
              ...[
                  ':projectSlug/diagrams',
                  ':projectSlug/diagrams/:remoteDiagramId',
              ].map((path) => ({
                  path,
                  async lazy() {
                      const { EditorPage } =
                          await import('./pages/editor-page/editor-page');
                      return { element: <EditorPage /> };
                  },
              })),
          ]
        : []),
    ...(backendEnabled
        ? ['diagrams/:diagramId']
        : ['', 'diagrams/:diagramId']
    ).map((path) => ({
        path,
        async lazy() {
            const { EditorPage } =
                await import('./pages/editor-page/editor-page');

            return {
                element: <EditorPage />,
            };
        },
    })),
    adminRoute,
    {
        path: 's/:token',
        async lazy() {
            const { ShareViewerPage } =
                await import('./pages/share-viewer-page/share-viewer-page');
            return {
                element: <ShareViewerPage />,
            };
        },
    },
    // The fork's example and template pages belong to the local editor: with a
    // server every diagram lives in a project, and these would only offer a
    // way to start one outside it.
    ...(backendEnabled
        ? []
        : ([
              {
                  path: 'examples',
                  async lazy() {
                      const { ExamplesPage } =
                          await import('./pages/examples-page/examples-page');
                      return {
                          element: <ExamplesPage />,
                      };
                  },
              },
              {
                  id: 'templates',
                  path: 'templates',
                  async lazy() {
                      const { TemplatesPage } =
                          await import('./pages/templates-page/templates-page');
                      return {
                          element: <TemplatesPage />,
                      };
                  },

                  loader: async (): Promise<TemplatesPageLoaderData> => {
                      const { tags, templates } =
                          await getTemplatesAndAllTags();

                      return {
                          allTags: tags,
                          templates,
                      };
                  },
              },
              {
                  id: 'templates_featured',
                  path: 'templates/featured',
                  async lazy() {
                      const { TemplatesPage } =
                          await import('./pages/templates-page/templates-page');
                      return {
                          element: <TemplatesPage />,
                      };
                  },
                  loader: async (): Promise<TemplatesPageLoaderData> => {
                      const { tags, templates } = await getTemplatesAndAllTags({
                          featured: true,
                      });

                      return {
                          allTags: tags,
                          templates,
                      };
                  },
              },
              {
                  id: 'templates_tags',
                  path: 'templates/tags/:tag',
                  async lazy() {
                      const { TemplatesPage } =
                          await import('./pages/templates-page/templates-page');
                      return {
                          element: <TemplatesPage />,
                      };
                  },
                  loader: async ({
                      params,
                  }): Promise<TemplatesPageLoaderData> => {
                      const { tags, templates } = await getTemplatesAndAllTags({
                          tag: params.tag?.replace(/-/g, ' '),
                      });

                      return {
                          allTags: tags,
                          templates,
                      };
                  },
              },
              {
                  id: 'templates_templateSlug',
                  path: 'templates/:templateSlug',
                  async lazy() {
                      const { TemplatePage } =
                          await import('./pages/template-page/template-page');
                      return {
                          element: <TemplatePage />,
                      };
                  },
                  loader: async ({
                      params,
                  }): Promise<TemplatePageLoaderData> => {
                      const { templates } =
                          await import('./templates-data/templates-data');
                      return {
                          template: templates.find(
                              (template) =>
                                  template.slug === params.templateSlug
                          ),
                      };
                  },
              },
              {
                  id: 'templates_load',
                  path: 'templates/clone/:templateSlug',
                  async lazy() {
                      const { CloneTemplatePage } =
                          await import('./pages/clone-template-page/clone-template-page');
                      return {
                          element: <CloneTemplatePage />,
                      };
                  },
                  loader: async ({ params }) => {
                      const { templates } =
                          await import('./templates-data/templates-data');
                      return {
                          template: templates.find(
                              (template) =>
                                  template.slug === params.templateSlug
                          ),
                      };
                  },
              },
          ] satisfies RouteObject[])),
    {
        path: '*',
        async lazy() {
            const { NotFoundPage } =
                await import('./pages/not-found-page/not-found-page');
            return {
                element: <NotFoundPage />,
            };
        },
    },
];

export const router = createBrowserRouter(buildRoutes(QUBDI_BACKEND_ENABLED));
