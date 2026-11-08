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
    primary: token('sidebar-primary'),
    'primary-foreground': token('sidebar-primary-foreground'),
    accent: token('sidebar-accent'),
    'accent-foreground': token('sidebar-accent-foreground'),
    border: token('sidebar-border'),
    ring: token('sidebar-ring'),
};

// One keyframe animation that grows an element by 5% and returns it.
const pulseOnce = {
    '0%, 100%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.05)' },
};

const radixHeight = 'var(--radix-accordion-content-height)';

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: { '2xl': '1400px' },
        },
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
                subtitle: token('subtitle'),
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
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: radixHeight },
                },
                'accordion-up': {
                    from: { height: radixHeight },
                    to: { height: '0' },
                },
                scale: pulseOnce,
                'scale-2': pulseOnce,
                blink: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0' },
                },
            },
            animation: {
                'accordion-down': 'accordion-down 200ms ease-out',
                'accordion-up': 'accordion-up 200ms ease-out',
                scale: 'scale 1s ease-in-out',
                'scale-2': 'scale-2 1s ease-in-out 2',
                blink: 'blink 1s infinite',
            },
        },
    },
    plugins: [animate],
};
