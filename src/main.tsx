import React from 'react';
import { createRoot } from 'react-dom/client';
// Font files are imported from code: Tailwind inlines CSS @imports without
// rewriting their url() paths, so the files were missing from the build.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './globals.css';
import { i18nReady } from '@/i18n/i18n';
import { provideDialectTypes } from '@/qbase/dialect-types';
import { App } from './app';

provideDialectTypes();

// the first screen is never shown in English first; if loading fails, start anyway
void i18nReady
    .catch(() => undefined)
    .then(() => {
        // public/browser-check.js already showed its notice in a browser that is too old
        if (Reflect.get(window, '__qbaseUnsupported')) return;
        createRoot(document.getElementById('root')!).render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        );
    });
