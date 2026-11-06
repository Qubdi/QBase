import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { TooltipProvider } from '@/platform/ui/tooltip';
import { ForcedPasswordChange } from '@/components/qubdi/forced-password-change';
import { QubdiProvider } from '@/context/qubdi-context/qubdi-provider';
import { HelmetData } from '@/helmet/helmet-data';
import { createAppRouter } from '@/platform/router/router';

const router = createAppRouter();

/** Titles, tooltips and the QBase session wrap the router; the password dialog sits beside it. */
export const App: React.FC = () => (
    <HelmetProvider>
        <HelmetData />
        <TooltipProvider>
            <QubdiProvider>
                <ForcedPasswordChange />
                <RouterProvider router={router} />
            </QubdiProvider>
        </TooltipProvider>
    </HelmetProvider>
);
