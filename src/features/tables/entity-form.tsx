import React, { useRef, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    FileKey,
    FileTypeCorner,
    ListChecks,
    MessageCircleMore,
} from 'lucide-react';
import { planAddColumn, planAddKey } from '@/core/commands/plan-column';
import type { Entity } from '@/core/model/entity';
import { DebouncedTextarea } from '@/platform/panel/debounced-input';
import { useKeepInPlace } from '@/platform/panel/keep-in-place';
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
 * that opens and closes its body. `onToggle` is given the header, which the
 * form keeps in place on screen when the sections change.
 */
export const Section: React.FC<{
    name: string;
    title: string;
    icon: React.ReactNode;
    open: boolean;
    onToggle: (header: HTMLElement) => void;
    children: React.ReactNode;
}> = ({ name, title, icon, open, onToggle, children }) => (
    <section data-section={name} className="border-t py-1 first:border-t-0">
        <h3 className="m-0">
            <button
                type="button"
                aria-expanded={open}
                onClick={(e) => onToggle(e.currentTarget)}
                className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs font-semibold text-slate-700 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-200"
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
        {open ? (
            <div className="space-y-2 px-2 pb-2 pt-1">{children}</div>
        ) : null}
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
    const form = useRef<HTMLDivElement>(null);
    // Opening a section folds the one that was open, which is usually the long
    // Fields above it: the panel is then scrolled to somewhere else. The header
    // that was clicked is kept where it is, so the result is under the pointer.
    const keep = useKeepInPlace(openSection);
    const toggle = (name: string, header: HTMLElement) => {
        keep(header);
        setOpenSection(openSection === name ? undefined : name);
    };
    // opened by a button elsewhere (the footer): the section's own header
    const show = (name: string) => {
        if (openSection === name) return;
        const header = form.current?.querySelector<HTMLElement>(
            `[data-section="${name}"] > h3 > button`
        );
        if (header) keep(header);
        setOpenSection(name);
    };
    const showChecks = !view;
    return (
        <div ref={form}>
            {hasDuplicateName(design, entity) ? (
                <p role="alert" className="px-2 py-1 text-xs text-amber-700">
                    {text('tables.duplicateName', { name: entity.name })}
                </p>
            ) : null}
            <Section
                name="fields"
                title={text('tables.fields')}
                icon={<FileTypeCorner />}
                open={openSection === 'fields'}
                onToggle={(header) => toggle('fields', header)}
            >
                <FieldsEditor
                    entity={entity}
                    addedId={addedId}
                    onAdded={setAddedId}
                />
            </Section>
            {view ? null : (
                <Section
                    name="indexes"
                    title={text('tables.indexes')}
                    icon={<FileKey />}
                    open={openSection === 'indexes'}
                    onToggle={(header) => toggle('indexes', header)}
                >
                    <IndexesEditor entity={entity} />
                </Section>
            )}
            {showChecks ? (
                <Section
                    name="checks"
                    title={text('tables.checks')}
                    icon={<ListChecks />}
                    open={openSection === 'checks'}
                    onToggle={(header) => toggle('checks', header)}
                >
                    <ChecksEditor entity={entity} />
                </Section>
            ) : null}
            <Section
                name="description"
                title={text('tables.description')}
                icon={<MessageCircleMore />}
                open={openSection === 'description'}
                onToggle={(header) => toggle('description', header)}
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
                                    show('indexes');
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
                                show('fields');
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
