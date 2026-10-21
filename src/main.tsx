// Polyfills must be imported first for Safari compatibility
import './polyfills';

import React from 'react';
import ReactDOM from 'react-dom/client';
// self-hosted fonts: nothing is requested from Google
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './index.css';
import './globals.css';
import { App } from './app';
import { i18nReady } from './i18n/i18n';

// the first screen waits (a moment) for the person's language, so it never
// flashes in English first; a language that fails to load falls back to English
void i18nReady.then(() =>
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    )
);
