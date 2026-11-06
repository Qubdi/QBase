import React from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { i18nReady } from '@/i18n/i18n';
import { provideDialectTypes } from '@/qbase/dialect-types';
import { App } from './app';

provideDialectTypes();

// the first screen is never shown in English first; if loading fails, start anyway
void i18nReady
    .catch(() => undefined)
    .then(() => {
        createRoot(document.getElementById('root')!).render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        );
    });
