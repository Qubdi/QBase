import React from 'react';

/** The empty-state picture: a dashed ghost card behind a small table card (128 x 96). */
const Illustration: React.FC = () => (
    <svg
        aria-hidden="true"
        viewBox="0 0 106 72"
        width="128"
        height="96"
        className="shrink-0 text-primary"
        fill="none"
    >
        <rect
            x="1"
            y="1"
            width="64"
            height="44"
            rx="6"
            className="stroke-muted-foreground/50"
            strokeWidth="1.5"
            strokeDasharray="4 3"
        />
        <rect
            x="33"
            y="19"
            width="72"
            height="52"
            rx="6"
            className="fill-card"
            stroke="currentColor"
            strokeWidth="2"
        />
        <path
            d="M33 31h72V25a6 6 0 0 0-6-6H39a6 6 0 0 0-6 6z"
            fill="currentColor"
            fillOpacity="0.15"
            stroke="currentColor"
            strokeWidth="2"
        />
        <circle cx="42" cy="25" r="2" fill="currentColor" />
        <path d="M49 25h22" stroke="currentColor" strokeWidth="2" />
        <path
            d="M43 42h16M65 42h14"
            className="stroke-muted-foreground/60"
            strokeWidth="2"
        />
        <path d="M43 52h16" stroke="currentColor" strokeWidth="2" />
        <path
            d="M65 52h8"
            className="stroke-muted-foreground/60"
            strokeWidth="2"
        />
    </svg>
);

/** An empty-state message: a picture, a title, a hint beneath it and room for a button. */
export const Notice: React.FC<{
    title: string;
    hint?: string;
    children?: React.ReactNode;
}> = ({ title, hint, children }) => (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <Illustration />
        <p className="text-lg font-medium leading-7 tracking-tight">{title}</p>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        {children}
    </div>
);
