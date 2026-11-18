import React, { useState } from 'react';
import {
    Crosshair,
    MoreVertical,
    ScanSearch,
    StickyNote,
    FileText,
} from 'lucide-react';
import { planAddNote, planAddRegion } from '@/core/commands/plan-visual';
import { ownerFromSelection, ownerName } from '@/core/model/memo-owner';
import { toast } from '@/platform/toast/use-toast';
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
import { newItemDragProps } from '@/canvas/drop-items';
import { useHoldMenu } from '@/platform/panel/hold-menu';
import { selectPanel } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { WindowedList } from '@/features/tables/windowed-list';
import { firstLine, listMemos, listRegions } from './visual-lists';
import type { VisualsTab } from '@/store/editor-state';

/** A list row with its actions menu; a touch hold on the row opens the menu (EDT-009). */
const ActionRow: React.FC<{
    testId: string;
    accent: string;
    label: string;
    items: { label: string; onSelect: () => void }[] | null;
    children: React.ReactNode;
}> = ({ testId, accent, label, items, children }) => {
    const { menu, hold } = useHoldMenu(items !== null);
    return (
        <div
            data-testid={testId}
            className="group relative flex min-h-11 items-center gap-1 overflow-hidden rounded-[10px] border bg-card py-1 pl-4 pr-1 hover:bg-accent/70"
            {...hold}
        >
            <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1"
                style={{ backgroundColor: accent }}
            />
            {children}
            {items ? (
                <ActionsMenu label={label} items={items} menu={menu} />
            ) : null}
        </div>
    );
};

const ActionsMenu: React.FC<{
    label: string;
    items: { label: string; onSelect: () => void }[];
    menu: { open: boolean; onOpenChange: (open: boolean) => void };
}> = ({ label, items, menu }) => (
    <DropdownMenu {...menu}>
        <DropdownMenuTrigger asChild>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                aria-label={label}
            >
                <MoreVertical />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
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
    dragKind: 'area' | 'note';
    addLabel: string;
    filterLabel: string;
    /** the add button cannot be used now, and `addHint` says what to do */
    addDisabled?: boolean;
    addHint?: string;
}> = ({
    value,
    onChange,
    onAdd,
    dragKind,
    addLabel,
    filterLabel,
    addDisabled,
    addHint,
}) => (
    <div className="flex items-center gap-2">
        <Input
            aria-label={filterLabel}
            placeholder={filterLabel}
            className="h-8 min-w-0 flex-1"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
        {onAdd ? (
            <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shrink-0 px-2"
                disabled={addDisabled}
                title={addDisabled ? addHint : undefined}
                onClick={onAdd}
                {...newItemDragProps(dragKind)}
            >
                {dragKind === 'area' ? <ScanSearch /> : <FileText />}
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
                dragKind="area"
                addLabel={text('visuals.addArea')}
                onAdd={locked ? undefined : () => edit(planAddRegion(design))}
            />
            {design.regions.order.length === 0 ? (
                <Notice
                    title={text('visuals.noAreas')}
                    hint={text('visuals.noAreasHint')}
                >
                    {locked ? null : (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="px-4 text-sm"
                            onClick={() => edit(planAddRegion(design))}
                        >
                            {text('visuals.addArea')}
                        </Button>
                    )}
                </Notice>
            ) : regions.length === 0 ? (
                <Notice title={text('visuals.noAreasMatch')} />
            ) : (
                <WindowedList
                    items={regions}
                    getId={(r) => r.id}
                    gap={8}
                    renderItem={(region) => (
                        <ActionRow
                            testId="area-row"
                            accent={region.tint}
                            label={text('visuals.areaActions')}
                            items={
                                locked
                                    ? null
                                    : [
                                          {
                                              label: text('visuals.deleteArea'),
                                              onSelect: () =>
                                                  edit({
                                                      type: 'item.remove',
                                                      collection: 'regions',
                                                      id: region.id,
                                                  }),
                                          },
                                      ]
                            }
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
                                className="size-8 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                                aria-label={text('common.focus')}
                                onClick={() => focus(region.id)}
                            >
                                <Crosshair />
                            </Button>
                        </ActionRow>
                    )}
                />
            )}
        </div>
    );
};

const NotesList: React.FC = () => {
    const { design, locked, edit } = useEditorEnv();
    const selection = useEditorStore((state) => state.ui.selection);
    // a note belongs to the selected table or area
    const owner = ownerFromSelection(design, selection);
    const addNote = () => {
        if (!owner) {
            toast({ description: text('visuals.selectOwner') });
            return;
        }
        edit(planAddNote(design, owner));
    };
    // with no table and no area there is nothing to attach a note to
    const nothingToAttach =
        design.entities.order.length === 0 && design.regions.order.length === 0;
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
                dragKind="note"
                addLabel={text('visuals.addNote')}
                onAdd={locked ? undefined : addNote}
                addDisabled={nothingToAttach}
                addHint={text('visuals.selectOwner')}
            />
            {design.memos.order.length === 0 ? (
                <Notice
                    title={text('visuals.noNotes')}
                    hint={text('visuals.noNotesHint')}
                >
                    {locked ? null : (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="px-4 text-sm"
                            disabled={nothingToAttach}
                            title={
                                nothingToAttach
                                    ? text('visuals.selectOwner')
                                    : undefined
                            }
                            onClick={addNote}
                        >
                            {text('visuals.addNote')}
                        </Button>
                    )}
                </Notice>
            ) : memos.length === 0 ? (
                <Notice title={text('visuals.noNotesMatch')} />
            ) : (
                <WindowedList
                    items={memos}
                    getId={(m) => m.id}
                    gap={8}
                    renderItem={(memo) => {
                        const line = firstLine(memo.body);
                        return (
                            <ActionRow
                                testId="note-row"
                                accent={memo.tint}
                                label={text('visuals.noteActions')}
                                items={
                                    locked
                                        ? null
                                        : [
                                              {
                                                  label: text(
                                                      'visuals.deleteNote'
                                                  ),
                                                  onSelect: () =>
                                                      edit({
                                                          type: 'item.remove',
                                                          collection: 'memos',
                                                          id: memo.id,
                                                      }),
                                              },
                                          ]
                                }
                            >
                                <span
                                    className={
                                        line
                                            ? 'min-w-0 flex-1 truncate text-sm'
                                            : 'min-w-0 flex-1 truncate text-sm italic text-muted-foreground'
                                    }
                                >
                                    {line || text('visuals.emptyNote')}
                                </span>
                                {memo.anchor ? (
                                    <span
                                        className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground"
                                        title={text('visuals.attachedTo', {
                                            name: ownerName(
                                                design,
                                                memo.anchor
                                            ),
                                        })}
                                    >
                                        {ownerName(design, memo.anchor)}
                                    </span>
                                ) : null}
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
                                    className="size-8 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                                    aria-label={text('common.focus')}
                                    onClick={() => focus(memo.id)}
                                >
                                    <Crosshair />
                                </Button>
                            </ActionRow>
                        );
                    }}
                />
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
            <div className="border-b p-2">
                <TabsList className="flex w-full">
                    <TabsTrigger value="areas" className="gap-1.5">
                        <ScanSearch className="size-3.5" />
                        {text('visuals.areas')}
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="gap-1.5">
                        <StickyNote className="size-3.5" />
                        {text('visuals.notes')}
                    </TabsTrigger>
                </TabsList>
            </div>
            <TabsContent
                value="areas"
                data-window-root
                className="mt-0 min-h-0 flex-1 overflow-y-auto"
            >
                <AreasList />
            </TabsContent>
            <TabsContent
                value="notes"
                data-window-root
                className="mt-0 min-h-0 flex-1 overflow-y-auto"
            >
                <NotesList />
            </TabsContent>
        </Tabs>
    );
};
