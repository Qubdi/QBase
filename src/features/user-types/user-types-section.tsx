import React, { useState } from 'react';
import {
    ChevronDown,
    ChevronRight,
    MoreHorizontal,
    Plus,
    X,
} from 'lucide-react';
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
            {values.length === 0 ? (
                <p className="text-xs text-muted-foreground">
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
    const { menu, hold } = useHoldMenu(!locked);
    return (
        <div className="rounded-md border" data-testid="user-type-row">
            <div className="flex items-center gap-1 p-1" {...hold}>
                <button
                    type="button"
                    aria-expanded={open}
                    aria-label={text('tables.toggle')}
                    className="flex size-7 shrink-0 items-center justify-center"
                    onClick={onToggle}
                >
                    {open ? (
                        <ChevronDown className="size-4" />
                    ) : (
                        <ChevronRight className="size-4" />
                    )}
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
                {locked ? null : (
                    <DropdownMenu {...menu}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 shrink-0"
                                aria-label={text('userTypes.actions')}
                            >
                                <MoreHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            {open ? (
                <div className="space-y-3 border-t p-2">
                    <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">
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
                </div>
            ) : null}
        </div>
    );
};

/** The Custom Types section (EDT-187 to EDT-199). Highlight Fields is dropped (EDT-196). */
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
            />
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
                {types.map((type) => (
                    <TypeRow
                        key={type.id}
                        type={type}
                        open={openId === type.id}
                        showSchema={showSchema}
                        onToggle={() =>
                            setOpenId(openId === type.id ? undefined : type.id)
                        }
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col gap-2 p-2">
            <div className="flex items-center gap-2">
                <Input
                    aria-label={text('common.filter')}
                    placeholder={text('common.filter')}
                    className="h-8"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                />
                {add}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
        </div>
    );
};
