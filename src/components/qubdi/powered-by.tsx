import React from 'react';
import { useTranslation } from 'react-i18next';

/** "Powered by Qubdi", the name in bold text. */
export const PoweredByMark: React.FC<{ className?: string }> = ({
    className,
}) => {
    const { t } = useTranslation();
    return (
        <span
            className={`pointer-events-none flex items-center gap-1 text-xs text-muted-foreground ${className ?? ''}`}
        >
            <span>{t('qubdi.account.poweredBy')}</span>
            {/* the name as plain text, so the i has the font's own dot */}
            <span
                aria-label="Qubdi"
                className="text-sm leading-none font-bold tracking-[-0.01em] text-foreground"
            >
                Qubdi
            </span>
        </span>
    );
};

/** The bottom of a page: "Powered by Qubdi" in the flow, below the content, so it never overlaps it. */
export const PageFooter: React.FC = () => (
    <footer className="mt-auto flex h-12 shrink-0 items-center justify-center">
        <PoweredByMark />
    </footer>
);
