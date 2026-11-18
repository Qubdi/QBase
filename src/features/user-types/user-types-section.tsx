import React, { useState } from 'react';
import {
    Brackets,
    Columns2,
    Eraser,
    MoreVertical,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import { ChevronDownIcon } from '@/platform/ui/radix-icons';
import { cn } from '@/lib/utils/utils';
import {
    planAddUserType,
    planSetUserTypeKind,
} from '@/core/commands/plan-visual';
import type { UserType, UserTypeKind } from '@/core/model/user-type';
import { OptionSelect } from '@/components/option-select/option-select';
import { typeOptions } from '@/features/tables/fields/type-options';
import { visibleSchemas } from '@/features/tables/table-list';
import { useHoldMenu } from '@/platform/panel/hold-menu';
import { InlineName } from '@/platform/panel/inline-name';
import { Notice } from '@/platform/panel/notice';
import { PANEL_LIST } from '@/platform/panel/panel-list';
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
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { WindowedList } from '@/features/tables/windowed-list';
import {
    listUserTypes,
    withEnumValue,
    withoutEnumValue,
} from './user-type-list';

const EnumValues: React.FC<{ type: UserType }> = ({ type }) => {
    const { locked, edit } = useEditorEnv();
    const text = useText();
    const [draft, setDraft] = useState('');
    const values = type.values ?? [];
    const set = (next: string[]) =>
        edit({
            type: 'item.update',
            collection: 'userTypes',
            id: type.id,
            patch: { values: next },
        });
    const add = () => {
        const next = withEnumValue(values, draft);
        if (next) {
            set(next);
            setDraft('');
        }
    };
    return (
        <div className="space-y-2">
            <span className="flex items-center gap-1.5 px-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                <Columns2 className="size-3.5" />
                {text('userTypes.enumValues')}
            </span>
            {values.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                    {text('userTypes.noValues')}
                </p>
            ) : (
                <ul className="flex flex-wrap gap-1">
                    {values.map((value) => (
                        <li
                            key={value}
                            className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                            {value}
                            {locked ? null : (
                                <button
                                    type="button"
                                    aria-label={text('userTypes.removeValue', {
                                        value,
                                    })}
                                    onClick={() =>
                                        set(withoutEnumValue(values, value))
                                    }
                                >
                                    <X className="size-3" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {locked ? null : (
                <div className="flex gap-1">
                    <Input
                        className="h-8"
                        aria-label={text('userTypes.valuePlaceholder')}
                        placeholder={text('userTypes.valuePlaceholder')}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') add();
                        }}
                    />
                    <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="size-8 shrink-0"
                        aria-label={text('userTypes.addValue')}
                        onClick={add}
                    >
                        <Plus />
                    </Button>
                </div>
            )}
        </div>
    );
};

const Members: React.FC<{ type: UserType }> = ({ type }) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const members = type.members ?? [];
    const options = typeOptions(
        design.databaseType,
        design.userTypes.order
            .map((id) => design.userTypes.byId[id])
            .filter((t) => t.id !== type.id)
    );
    const names = [...options.standard, ...options.custom].map(
        (o) => o.ref.name
    );
    const set = (next: UserType['members']) =>
        edit({
            type: 'item.update',
            collection: 'userTypes',
            id: type.id,
            patch: { members: next },
        });
    return (
        <div className="space-y-2">
            {members.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    {text('userTypes.noMembers')}
                </p>
            ) : null}
            {members.map((member, i) => (
                <div key={i} className="flex items-center gap-1">
                    <Input
                        className="h-8 min-w-0 flex-1"
                        aria-label={text('userTypes.memberName')}
                        placeholder={text('userTypes.memberName')}
                        readOnly={locked}
                        value={member.name}
                        onChange={(e) =>
                            set(
                                members.map((m, j) =>
                                    j === i ? { ...m, name: e.target.value } : m
                                )
                            )
                        }
                    />
                    <OptionSelect
                        aria-label={text('userTypes.memberType')}
                        placeholder={text('userTypes.memberType')}
                        disabled={locked}
                        value={member.type}
                        onValueChange={(v) =>
                            set(
                                members.map((m, j) =>
                                    j === i ? { ...m, type: v } : m
                                )
                            )
                        }
                        options={(names.includes(member.type) || !member.type
                            ? names
                            : [member.type, ...names]
                        ).map((n) => ({ value: n, label: n }))}
                    />
                    {locked ? null : (
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7 shrink-0"
                            aria-label={text('userTypes.removeMember')}
                            onClick={() =>
                                set(members.filter((_, j) => j !== i))
                            }
                        >
                            <X />
                        </Button>
                    )}
                </div>
            ))}
            {locked ? null : (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                        set([...members, { name: '', type: names[0] ?? '' }])
                    }
                >
                    <Plus />
                    {text('userTypes.addMember')}
                </Button>
            )}
        </div>
    );
};

const TypeRow: React.FC<{
    type: UserType;
    open: boolean;
    onToggle: () => void;
    showSchema: boolean;
}> = ({ type, open, onToggle, showSchema }) => {
    const { locked, edit } = useEditorEnv();
    const text = useText();
    const { menu, hold } = useHoldMenu(true);
    const store = useEditorStoreApi();
    // Highlight Fields changes what is drawn, not the design: allowed when locked
    const highlighted = useEditorStore(
        (s) => s.ui.highlightedTypeId === type.id
    );
    return (
        <div
            className="rounded-[10px] border bg-card"
            data-testid="user-type-row"
        >
            <div
                className={cn(
                    'group flex h-11 items-center gap-1 rounded-[10px] pl-2 pr-1 hover:bg-accent/70',
                    open && 'bg-accent/70'
                )}
                {...hold}
            >
                <button
                    type="button"
                    aria-expanded={open}
                    aria-label={text('tables.toggle')}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={onToggle}
                >
                    <ChevronDownIcon
                        className={cn(
                            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                            open && 'rotate-180'
                        )}
                    />
                </button>
                <InlineName
                    value={type.name}
                    readOnly={locked}
                    editLabel={text('userTypes.rename')}
                    hint={text('tables.doubleClickToEdit')}
                    className="text-sm font-medium"
                    onActivate={onToggle}
                    onSave={(name) =>
                        edit({
                            type: 'item.update',
                            collection: 'userTypes',
                            id: type.id,
                            patch: { name },
                        })
                    }
                >
                    {showSchema && type.schema ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                            ({type.schema})
                        </span>
                    ) : null}
                </InlineName>
                <span className="shrink-0 rounded-full border px-2 text-[11px] font-semibold leading-5 text-muted-foreground">
                    {type.kind === 'enum'
                        ? text('userTypes.enum')
                        : text('userTypes.composite')}
                </span>
                <DropdownMenu {...menu}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 shrink-0"
                            aria-label={text('userTypes.actions')}
                        >
                            <MoreVertical />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem
                            onSelect={() =>
                                store
                                    .getState()
                                    .setHighlightedType(
                                        highlighted ? undefined : type.id
                                    )
                            }
                        >
                            {highlighted
                                ? text('userTypes.clearHighlight')
                                : text('userTypes.highlight')}
                        </DropdownMenuItem>
                        {locked ? null : (
                            <DropdownMenuItem
                                onSelect={() =>
                                    edit({
                                        type: 'item.remove',
                                        collection: 'userTypes',
                                        id: type.id,
                                    })
                                }
                            >
                                {text('userTypes.delete')}
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {open ? (
                <div className="space-y-3 p-2">
                    <div className="space-y-1">
                        <span className="flex items-center gap-1.5 px-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                            <Brackets className="size-3.5" />
                            {text('userTypes.kind')}
                        </span>
                        <OptionSelect
                            aria-label={text('userTypes.kind')}
                            value={type.kind}
                            disabled={locked}
                            onValueChange={(v) =>
                                edit(
                                    planSetUserTypeKind(
                                        type.id,
                                        v as UserTypeKind
                                    )
                                )
                            }
                            options={[
                                {
                                    value: 'enum',
                                    label: text('userTypes.enum'),
                                },
                                {
                                    value: 'composite',
                                    label: text('userTypes.composite'),
                                },
                            ]}
                        />
                    </div>
                    {type.kind === 'enum' ? (
                        <EnumValues type={type} />
                    ) : (
                        <Members type={type} />
                    )}
                    <div className="flex flex-col items-center gap-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={() =>
                                store
                                    .getState()
                                    .setHighlightedType(
                                        highlighted ? undefined : type.id
                                    )
                            }
                        >
                            <Eraser />
                            {highlighted
                                ? text('userTypes.clearHighlight')
                                : text('userTypes.highlight')}
                        </Button>
                        {locked ? null : (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                    edit({
                                        type: 'item.remove',
                                        collection: 'userTypes',
                                        id: type.id,
                                    })
                                }
                            >
                                <Trash2 />
                                {text('userTypes.delete')}
                            </Button>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

/** The Custom Types section (EDT-187 to EDT-199). */
export const UserTypesSection: React.FC = () => {
    const { design, filter, showViews, locked, edit } = useEditorEnv();
    const text = useText();
    const [filterText, setFilterText] = useState('');
    const [openId, setOpenId] = useState<string | undefined>();
    const types = listUserTypes(design, filterText);
    const showSchema = visibleSchemas(design, filter, showViews).length > 1;
    const add = locked ? null : (
        <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0 px-2"
            onClick={() => edit(planAddUserType(design))}
        >
            <Plus />
            {text('userTypes.add')}
        </Button>
    );

    let body: React.ReactNode;
    if (design.userTypes.order.length === 0) {
        body = (
            <Notice
                title={text('userTypes.empty')}
                hint={text('userTypes.emptyHint')}
            >
                {locked ? null : (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="px-4 text-sm"
                        onClick={() => edit(planAddUserType(design))}
                    >
                        {text('userTypes.add')}
                    </Button>
                )}
            </Notice>
        );
    } else if (types.length === 0) {
        body = (
            <Notice title={text('userTypes.noMatch')}>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setFilterText('')}
                >
                    {text('common.clearFilter')}
                </Button>
            </Notice>
        );
    } else {
        body = (
            <div className="space-y-1">
                <WindowedList
                    items={types}
                    getId={(t) => t.id}
                    keepIds={[openId]}
                    scrollToId={openId}
                    renderItem={(type) => (
                        <TypeRow
                            type={type}
                            open={openId === type.id}
                            showSchema={showSchema}
                            onToggle={() =>
                                setOpenId(
                                    openId === type.id ? undefined : type.id
                                )
                            }
                        />
                    )}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col gap-1 px-2 py-1">
            <div className="flex items-center gap-2">
                <Input
                    aria-label={text('common.filter')}
                    placeholder={text('common.filter')}
                    className="h-8 min-w-0 flex-1"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                />
                {add}
            </div>
            <div data-window-root className={PANEL_LIST}>
                {body}
            </div>
        </div>
    );
};
