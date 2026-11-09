import animate from 'tailwindcss-animate';
import { fontFamily } from 'tailwindcss/defaultTheme';

// Colours are CSS variables holding "H S% L%" triples (see src/globals.css),
// so Tailwind can still apply an opacity modifier to them.
const token = (name) => `hsl(var(--${name}))`;

// A surface colour comes with the colour of the text that sits on it.
const surface = (name) => ({
    DEFAULT: token(name),
    foreground: token(`${name}-foreground`),
});

// Sidebar tokens use "sidebar-" as a prefix instead of a nested object.
const sidebarTokens = {
    DEFAULT: token('sidebar-background'),
    foreground: token('sidebar-foreground'),
    accent: token('sidebar-accent'),
};

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                primary: ['Manrope', ...fontFamily.sans],
                sans: ['Inter', ...fontFamily.sans],
                mono: ['JetBrains Mono', ...fontFamily.mono],
            },
            colors: {
                border: token('border'),
                input: token('input'),
                ring: token('ring'),
                background: token('background'),
                foreground: token('foreground'),
                'rail-hover': token('rail-hover'),
                'rail-selected': token('rail-selected-text'),
                'tab-active': surface('tab-active'),
                primary: surface('primary'),
                secondary: surface('secondary'),
                destructive: surface('destructive'),
                muted: surface('muted'),
                accent: surface('accent'),
                popover: surface('popover'),
                card: surface('card'),
                sidebar: sidebarTokens,
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: '0.125rem',
            },
        },
    },
    plugins: [animate],
};
