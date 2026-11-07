import React from 'react';
import { Highlighter, Magnet, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/utils';
import { isMacPlatform, shortcutLabel } from './keyboard';

export interface CornerToolsProps {
    editable: boolean;
    snapOn: boolean;
    onSnap(): void;
    /** some tables overlap */
    overlapping: boolean;
    onFlashOverlaps(): void;
    highlight?: { label: string; clear(): void };
}

const base =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card shadow-sm transition hover:bg-muted';

/** Small round buttons at the top-left: snap to grid, overlap warning, custom type highlight. */
export function CornerTools(props: CornerToolsProps) {
    const { t } = useTranslation();
    const shift = shortcutLabel(['Shift'], isMacPlatform());
    const snapLabel = t('canvas.snap.label', { key: shift });
    return (
        <div className="qb-corner">
            {props.editable ? (
                <button
                    type="button"
                    className={cn(
                        base,
                        props.snapOn &&
                            'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                    )}
                    aria-pressed={props.snapOn}
                    aria-label={snapLabel}
                    title={snapLabel}
                    onClick={props.onSnap}
                >
                    <Magnet className="h-4 w-4" />
                </button>
            ) : null}
            {props.overlapping ? (
                <button
                    type="button"
                    className={cn(base, 'animate-in fade-in text-amber-600')}
                    aria-label={t('canvas.overlap.label')}
                    title={t('canvas.overlap.label')}
                    onClick={props.onFlashOverlaps}
                >
                    <TriangleAlert className="h-4 w-4" />
                </button>
            ) : null}
            {props.highlight ? (
                <button
                    type="button"
                    className={cn(
                        base,
                        'border-yellow-400 bg-yellow-300 text-yellow-900'
                    )}
                    aria-label={t('canvas.highlight.label', {
                        name: props.highlight.label,
                    })}
                    title={t('canvas.highlight.label', {
                        name: props.highlight.label,
                    })}
                    onClick={props.highlight.clear}
                >
                    <Highlighter className="h-4 w-4" />
                </button>
            ) : null}
        </div>
    );
}
