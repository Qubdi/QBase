import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageFooter } from '@/components/qubdi/powered-by';

export const NotFoundPage: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <main className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                <p className="font-primary text-7xl font-extrabold text-primary">
                    404
                </p>
                <h1 className="font-primary text-2xl font-bold">
                    {t('editor.common.notFound.title')}
                </h1>
                <p className="max-w-sm text-sm text-muted-foreground">
                    {t('editor.common.notFound.body')}
                </p>
            </main>
            <PageFooter />
        </div>
    );
};
