import React from 'react';
import { useTranslation } from 'react-i18next';
import { databaseIcon } from '@/components/diagram-icon/database-logos';
import { dialectFor } from '@/dialects/registry';
import { EXAMPLES } from './examples';
import type { Example } from './examples';

/** One card per example: the database's picture, the subject and what it holds. */
export const ExamplesGrid: React.FC<{
    disabled?: boolean;
    onPick: (example: Example) => void;
}> = ({ disabled, onPick }) => {
    const { t } = useTranslation();
    return (
        <ul className="grid max-h-[460px] grid-cols-2 gap-3 overflow-y-auto p-1 max-sm:grid-cols-1">
            {EXAMPLES.map((example) => (
                <li key={example.id} className="min-w-0">
                    <button
                        type="button"
                        disabled={disabled}
                        data-example={example.id}
                        onClick={() => onPick(example)}
                        className="flex h-full w-full items-start gap-3 rounded-[10px] border border-input bg-background p-3 text-left shadow-xs transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                        <img
                            src={databaseIcon(example.databaseType)}
                            alt=""
                            draggable={false}
                            className="mt-0.5 size-8 shrink-0 object-contain"
                        />
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold">
                                {example.name}
                            </span>
                            <span className="block text-xs font-medium text-primary">
                                {dialectFor(example.databaseType).label}
                            </span>
                            <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                                {t(`editor.designs.examples.${example.id}`)}
                            </span>
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
};
