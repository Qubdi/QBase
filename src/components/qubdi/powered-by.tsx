import React from 'react';

/** "Powered by Qubdi" with the brand's green dot on the last i. */
export const PoweredByMark: React.FC<{ className?: string }> = ({
    className,
}) => (
    <span
        className={`pointer-events-none flex items-center gap-1 text-xs text-muted-foreground ${className ?? ''}`}
    >
        <span>Powered by</span>
        {/* the name as text, with the brand's green dot on the last i */}
        <span
            aria-label="Qubdi"
            className="inline-flex items-baseline text-sm leading-none font-bold tracking-[-0.01em] text-foreground"
        >
            <span aria-hidden="true">Qubd</span>
            <span aria-hidden="true" className="relative inline-block">
                ı
                <span className="absolute top-[0.08em] left-1/2 size-[0.22em] -translate-x-1/2 rounded-full bg-[#00f5a0]" />
            </span>
        </span>
    </span>
);

/** The bottom of a page: "Powered by Qubdi" in the flow, below the content, so it never overlaps it. */
export const PageFooter: React.FC = () => (
    <footer className="mt-auto flex h-12 shrink-0 items-center justify-center">
        <PoweredByMark />
    </footer>
);
