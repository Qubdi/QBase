import React, { useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    FileKey,
    FileTypeCorner,
    ListChecks,
    MessageCircleMore,
} from 'lucide-react';
import { planAddColumn, planAddKey } from '@/core/commands/plan-column';
import { traitsOf } from '@/core/model/database';
import type { Entity } from '@/core/model/entity';
import { rulesOf } from '@/core/model/lookup';
import { DebouncedTextarea } from '@/platform/panel/debounced-input';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { ColorPicker } from '@/components/color-picker/color-picker';
import { hasDuplicateName } from './table-list';
import { ChecksEditor } from './checks-editor';
import { FieldsEditor } from './fields/fields-editor';
import { IndexesEditor } from './indexes-editor';

/**
 * One accordion section of a table form: a 24 px header (icon, title, chevron)
 * that opens and closes its body.
 */
export const Section: React.FC<{
    title: string;
    icon: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}> = ({ title, icon, open, onToggle, children }) => (
    <section className="py-1">
        <h3 className="m-0">
            <button
                type="button"
                aria-expanded={open}
                onClick={onToggle}
                className="flex h-6 w-full items-center gap-2 rounded-sm px-2 text-xs font-medium text-slate-600 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-300"
            >
                <span className="shrink-0 [&_svg]:size-4">{icon}</span>
                <span className="flex-1 text-left">{title}</span>
                {open ? (
                    <ChevronUp className="size-4" />
                ) : (
                    <ChevronDown className="size-4" />
                )}
            </button>
        </h3>
        {open ? <div className="space-y-2 px-1 py-2">{children}</div> : null}
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
    const [openSection, setOpenSection] = useState<string | undefined>(
        'fields'
    );
    const [addedId, setAddedId] = useState<string | undefined>();
    const toggle = (name: string) =>
        setOpenSection(openSection === name ? undefined : name);
    const showChecks =
        !view &&
        (traitsOf(design.databaseType).hasChecks ||
            rulesOf(design, entity).length > 0);
    return (
        <div>
            {hasDuplicateName(design, entity) ? (
                <p role="alert" className="px-2 py-1 text-xs text-amber-700">
                    {text('tables.duplicateName', { name: entity.name })}
                </p>
            ) : null}
            <Section
                title={text('tables.fields')}
                icon={<FileTypeCorner />}
                open={openSection === 'fields'}
                onToggle={() => toggle('fields')}
            >
                <FieldsEditor
                    entity={entity}
                    addedId={addedId}
                    onAdded={setAddedId}
                />
            </Section>
            {view ? null : (
                <Section
                    title={text('tables.indexes')}
                    icon={<FileKey />}
                    open={openSection === 'indexes'}
                    onToggle={() => toggle('indexes')}
                >
                    <IndexesEditor entity={entity} />
                </Section>
            )}
            {showChecks ? (
                <Section
                    title={text('tables.checks')}
                    icon={<ListChecks />}
                    open={openSection === 'checks'}
                    onToggle={() => toggle('checks')}
                >
                    <ChecksEditor entity={entity} />
                </Section>
            ) : null}
            <Section
                title={text('tables.description')}
                icon={<MessageCircleMore />}
                open={openSection === 'description'}
                onToggle={() => toggle('description')}
            >
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
            <div className="sticky bottom-0 flex items-center gap-2 border-t bg-card px-1 py-1">
                {view ? null : (
                    <ColorPicker
                        color={entity.color}
                        disabled={locked}
                        className="h-6 w-8"
                        onChange={(color) =>
                            edit({
                                type: 'entity.update',
                                id: entity.id,
                                patch: { color },
                            })
                        }
                    />
                )}
                <span className="flex-1" />
                {locked ? null : (
                    <>
                        {view ? null : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    edit(planAddKey(design, entity.id));
                                    setOpenSection('indexes');
                                }}
                            >
                                <FileKey />
                                {text('tables.addIndex')}
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const command = planAddColumn(
                                    design,
                                    entity.id
                                );
                                if (command?.type === 'part.insert')
                                    setAddedId(command.item.id);
                                edit(command);
                                setOpenSection('fields');
                            }}
                        >
                            <FileTypeCorner />
                            {text('tables.addField')}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};
