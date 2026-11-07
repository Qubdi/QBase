import React from 'react';

/** An empty-state message: a title, a hint beneath it and room for a button. */
export const Notice: React.FC<{
    title: string;
    hint?: string;
    children?: React.ReactNode;
}> = ({ title, hint, children }) => (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <p className="text-sm font-medium">{title}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {children}
    </div>
);
