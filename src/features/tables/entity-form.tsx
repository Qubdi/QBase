import React from 'react';
import { Plus } from 'lucide-react';
import { planAddColumn } from '@/core/commands/plan-column';
import type { Entity } from '@/core/model/entity';
import { DebouncedTextarea } from '@/platform/panel/debounced-input';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { ChecksEditor } from './checks-editor';
import { FieldsEditor } from './fields/fields-editor';
import { IndexesEditor } from './indexes-editor';

export const Section: React.FC<{
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, action, children }) => (
    <section className="space-y-2">
        <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </h4>
            {action}
        </div>
        {children}
    </section>
);

/**
 * The editors of one table: fields, indexes, checks and the description. The
 * side panel shows it under an open row; the canvas shows it in place of the
 * card while a table is edited.
 */
export const EntityForm: React.FC<{ entity: Entity }> = ({ entity }) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const view = entity.kind === 'view';
    return (
        <div className="space-y-4">
            <Section
                title={text('tables.fields')}
                action={
                    locked ? null : (
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-label={text('tables.addField')}
                            onClick={() =>
                                edit(planAddColumn(design, entity.id))
                            }
                        >
                            <Plus />
                        </Button>
                    )
                }
            >
                <FieldsEditor entity={entity} />
            </Section>
            {view ? null : (
                <Section title={text('tables.indexes')}>
                    <IndexesEditor entity={entity} />
                </Section>
            )}
            {view ? null : (
                <Section title={text('tables.checks')}>
                    <ChecksEditor entity={entity} />
                </Section>
            )}
            <Section title={text('tables.description')}>
                <DebouncedTextarea
                    aria-label={text('tables.description')}
                    value={entity.comments ?? ''}
                    readOnly={locked}
                    placeholder={text('tables.noDescription')}
                    onCommit={(comments) =>
                        edit({
                            type: 'entity.update',
                            id: entity.id,
                            patch: {
                                comments:
                                    comments === '' ? undefined : comments,
                            },
                        })
                    }
                />
            </Section>
        </div>
    );
};
