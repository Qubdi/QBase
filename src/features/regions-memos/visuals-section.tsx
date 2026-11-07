import React, { useState } from 'react';
import { MoreHorizontal, Plus, Crosshair } from 'lucide-react';
import { planAddMemo, planAddRegion } from '@/core/commands/plan-visual';
import { ColorPicker } from '@/components/color-picker/color-picker';
import { InlineName } from '@/platform/panel/inline-name';
import { Notice } from '@/platform/panel/notice';
import { useFocus } from '@/platform/panel/panel-context';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/platform/ui/dropdown-menu';
import { Input } from '@/platform/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/platform/ui/tabs';
import { selectPanel } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { firstLine, listMemos, listRegions } from './visual-lists';
import type { VisualsTab } from '@/store/editor-state';

const ActionsMenu: React.FC<{
    label: string;
    items: { label: string; onSelect: () => void }[];
}> = ({ label, items }) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                aria-label={label}
            >
                <MoreHorizontal />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
            {items.map((item) => (
                <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
                    {item.label}
                </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
    </DropdownMenu>
);

const Header: React.FC<{
    value: string;
    onChange: (value: string) => void;
    onAdd?: () => void;
    addLabel: string;
    filterLabel: string;
}> = ({ value, onChange, onAdd, addLabel, filterLabel }) => (
    <div className="flex items-center gap-2">
        <Input
            aria-label={filterLabel}
            placeholder={filterLabel}
            className="h-8"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
        {onAdd ? (
            <Button type="button" size="sm" onClick={onAdd}>
                <Plus />
                {addLabel}
            </Button>
        ) : null}
    </div>
);

const AreasList: React.FC = () => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const focus = useFocus();
    const [filterText, setFilterText] = useState('');
    const regions = listRegions(design, filterText);
    return (
        <div className="space-y-2 p-2">
            <Header
                value={filterText}
                onChange={setFilterText}
                filterLabel={text('visuals.areaFilter')}
                addLabel={text('visuals.addArea')}
                onAdd={locked ? undefined : () => edit(planAddRegion(design))}
            />
            {design.regions.order.length === 0 ? (
                <Notice
                    title={text('visuals.noAreas')}
                    hint={text('visuals.noAreasHint')}
                />
            ) : regions.length === 0 ? (
                <Notice title={text('visuals.noAreasMatch')} />
            ) : (
                regions.map((region) => (
                    <div
                        key={region.id}
                        data-testid="area-row"
                        className="flex items-center gap-1 rounded-md border p-1"
                    >
                        <InlineName
                            value={region.label}
                            readOnly={locked}
                            editLabel={text('visuals.editName')}
                            className="text-sm font-medium"
                            onSave={(label) =>
                                edit({
                                    type: 'item.update',
                                    collection: 'regions',
                                    id: region.id,
                                    patch: { label },
                                })
                            }
                        />
                        <ColorPicker
                            color={region.tint}
                            disabled={locked}
                            onChange={(tint) =>
                                edit({
                                    type: 'item.update',
                                    collection: 'regions',
                                    id: region.id,
                                    patch: { tint },
                                })
                            }
                        />
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7 shrink-0"
                            aria-label={text('common.focus')}
                            onClick={() => focus(region.id)}
                        >
                            <Crosshair />
                        </Button>
                        {locked ? null : (
                            <ActionsMenu
                                label={text('visuals.areaActions')}
                                items={[
                                    {
                                        label: text('visuals.deleteArea'),
                                        onSelect: () =>
                                            edit({
                                                type: 'item.remove',
                                                collection: 'regions',
                                                id: region.id,
                                            }),
                                    },
                                ]}
                            />
                        )}
                    </div>
                ))
            )}
        </div>
    );
};

const NotesList: React.FC = () => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const focus = useFocus();
    const [filterText, setFilterText] = useState('');
    const memos = listMemos(design, filterText);
    return (
        <div className="space-y-2 p-2">
            <Header
                value={filterText}
                onChange={setFilterText}
                filterLabel={text('common.filter')}
                addLabel={text('visuals.addNote')}
                onAdd={locked ? undefined : () => edit(planAddMemo())}
            />
            {design.memos.order.length === 0 ? (
                <Notice
                    title={text('visuals.noNotes')}
                    hint={text('visuals.noNotesHint')}
                />
            ) : memos.length === 0 ? (
                <Notice title={text('visuals.noNotesMatch')} />
            ) : (
                memos.map((memo) => {
                    const line = firstLine(memo.body);
                    return (
                        <div
                            key={memo.id}
                            data-testid="note-row"
                            className="flex items-center gap-1 rounded-md border p-1"
                        >
                            <span
                                className={
                                    line
                                        ? 'min-w-0 flex-1 truncate text-sm'
                                        : 'min-w-0 flex-1 truncate text-sm text-muted-foreground'
                                }
                            >
                                {line || text('visuals.emptyNote')}
                            </span>
                            <ColorPicker
                                color={memo.tint}
                                disabled={locked}
                                onChange={(tint) =>
                                    edit({
                                        type: 'item.update',
                                        collection: 'memos',
                                        id: memo.id,
                                        patch: { tint },
                                    })
                                }
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 shrink-0"
                                aria-label={text('common.focus')}
                                onClick={() => focus(memo.id)}
                            >
                                <Crosshair />
                            </Button>
                            {locked ? null : (
                                <ActionsMenu
                                    label={text('visuals.noteActions')}
                                    items={[
                                        {
                                            label: text('visuals.deleteNote'),
                                            onSelect: () =>
                                                edit({
                                                    type: 'item.remove',
                                                    collection: 'memos',
                                                    id: memo.id,
                                                }),
                                        },
                                    ]}
                                />
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
};

/** The Visuals section: Areas and Notes tabs, opening on Areas (EDT-208 to EDT-218). */
export const VisualsSection: React.FC = () => {
    const text = useText();
    const store = useEditorStoreApi();
    const tab = useEditorStore(selectPanel).visualsTab;
    return (
        <Tabs
            value={tab}
            onValueChange={(v) =>
                store.getState().showPanel(undefined, v as VisualsTab)
            }
            className="flex h-full flex-col"
        >
            <TabsList className="m-2 self-start">
                <TabsTrigger value="areas">{text('visuals.areas')}</TabsTrigger>
                <TabsTrigger value="notes">{text('visuals.notes')}</TabsTrigger>
            </TabsList>
            <TabsContent
                value="areas"
                className="min-h-0 flex-1 overflow-y-auto"
            >
                <AreasList />
            </TabsContent>
            <TabsContent
                value="notes"
                className="min-h-0 flex-1 overflow-y-auto"
            >
                <NotesList />
            </TabsContent>
        </Tabs>
    );
};
