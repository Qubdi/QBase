import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { TooltipProvider } from './components/tooltip/tooltip';
import { HelmetData } from './helmet/helmet-data';
import { HelmetProvider } from 'react-helmet-async';
import { QubdiProvider } from './context/qubdi-context/qubdi-provider';
import { ForcedPasswordChange } from './components/qubdi/forced-password-change';

export const App = () => {
    return (
        <HelmetProvider>
            <HelmetData />
            <TooltipProvider>
                <QubdiProvider>
                    <RouterProvider router={router} />
                    <ForcedPasswordChange />
                </QubdiProvider>
            </TooltipProvider>
        </HelmetProvider>
    );
};
