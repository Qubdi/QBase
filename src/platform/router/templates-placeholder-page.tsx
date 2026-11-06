import React from 'react';
import { PageFooter } from '@/components/qubdi/powered-by';

/** The example and template pages are not rebuilt yet; their paths still resolve. */
export const TemplatesPlaceholderPage: React.FC = () => (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
        <main className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <h1 className="font-primary text-2xl font-bold">
                Examples and templates
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground">
                This page is not available in this version.
            </p>
        </main>
        <PageFooter />
    </div>
);
