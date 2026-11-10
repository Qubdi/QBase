import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router-dom';

/** What replaces a screen that failed to draw or to load: say so, and offer a reload. */
export const ProblemPage: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div
            role="alert"
            className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground"
        >
            <h1 className="text-3xl font-bold tracking-tight">
                {t('editor.common.problem.title')}
            </h1>
            <p className="max-w-md text-muted-foreground">
                {t('editor.common.problem.body')}
            </p>
            <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
                onClick={() => window.location.reload()}
            >
                {t('editor.common.problem.reload')}
            </button>
        </div>
    );
};

/** The `errorElement` of every route: a failed page or chunk shows this, not a blank screen. */
export const RouteError: React.FC = () => {
    const error = useRouteError();
    React.useEffect(() => {
        console.error(error);
    }, [error]);
    return <ProblemPage />;
};

/** Catches an error thrown while drawing anything outside the routes. */
export class AppErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { failed: boolean }
> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        console.error(error);
    }

    render() {
        return this.state.failed ? <ProblemPage /> : this.props.children;
    }
}
