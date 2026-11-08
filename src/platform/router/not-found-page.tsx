import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageFooter } from '@/components/qubdi/powered-by';

/** The page for an address that leads nowhere: one centred column at the top, footer at the bottom. */
export const NotFoundPage: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
            <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center px-4 pt-16 text-center">
                <p className="text-[128px] leading-[128px] font-extrabold tracking-[-3.2px] text-primary">
                    404
                </p>
                <h1 className="mt-8 text-4xl leading-10 font-bold tracking-[-0.9px]">
                    {t('editor.common.notFound.title')}
                </h1>
                <p className="mt-4 text-lg leading-7 font-light text-muted-foreground">
                    {t('editor.common.notFound.body')}
                </p>
            </main>
            <PageFooter />
        </div>
    );
};
