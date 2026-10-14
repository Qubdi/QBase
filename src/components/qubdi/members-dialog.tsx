import React, { useCallback, useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { Input } from '@/components/input/input';
import { api, errorMessage, type RemoteMember } from '@/lib/qubdi/api';

export interface MembersDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Server diagram id; undefined when the diagram has not been synced yet. */
    remoteId: string | undefined;
    currentUserId: string;
}

const ROLE_OPTIONS = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'editor', label: 'Editor' },
];

export const MembersDialog: React.FC<MembersDialogProps> = ({
    open,
    onOpenChange,
    remoteId,
    currentUserId,
}) => {
    const [members, setMembers] = useState<RemoteMember[]>([]);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!remoteId) return;
        try {
            setMembers(await api.listMembers(remoteId));
        } catch (e) {
            setError(errorMessage(e));
        }
    }, [remoteId]);

    useEffect(() => {
        if (open) {
            setError(null);
            void reload();
        }
    }, [open, reload]);

    const isOwner = members.some(
        (m) => m.userId === currentUserId && m.role === 'owner'
    );

    const run = async (fn: () => Promise<unknown>) => {
        setError(null);
        try {
            await fn();
            await reload();
        } catch (e) {
            setError(errorMessage(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md" showClose>
                <DialogHeader>
                    <DialogTitle>Members</DialogTitle>
                    <DialogDescription>
                        {remoteId &&
                        members.length > 0 &&
                        !members.some((m) => m.role === 'owner')
                            ? 'Access to this diagram comes from its project. Ask an admin to change who can open or edit it.'
                            : 'Owners and editors can edit. Viewers can only read.'}
                    </DialogDescription>
                </DialogHeader>
                {!remoteId ? (
                    <p className="text-sm text-muted-foreground">
                        Sync this diagram to the server first, then you can
                        invite people.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        <ul
                            className="flex flex-col gap-2"
                            aria-label="Members"
                        >
                            {members.map((m) => (
                                <li
                                    key={m.userId}
                                    className="flex items-center justify-between gap-2 text-sm"
                                >
                                    <span className="truncate">{m.email}</span>
                                    {m.role === 'owner' || !isOwner ? (
                                        <span className="text-muted-foreground">
                                            {m.role}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            <OptionSelect
                                                size="sm"
                                                className="w-28"
                                                aria-label={`Role for ${m.email}`}
                                                value={m.role}
                                                onValueChange={(v) =>
                                                    void run(() =>
                                                        api.changeMemberRole(
                                                            remoteId,
                                                            m.userId,
                                                            v as
                                                                | 'editor'
                                                                | 'viewer'
                                                        )
                                                    )
                                                }
                                                options={ROLE_OPTIONS}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    run(() =>
                                                        api.removeMember(
                                                            remoteId,
                                                            m.userId
                                                        )
                                                    )
                                                }
                                            >
                                                Remove
                                            </Button>
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                        {isOwner ? (
                            <form
                                className="flex gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void run(async () => {
                                        await api.addMember(
                                            remoteId,
                                            email,
                                            role
                                        );
                                        setEmail('');
                                    });
                                }}
                            >
                                <Input
                                    type="email"
                                    placeholder="Email of an existing user"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                                <OptionSelect
                                    className="w-28 shrink-0"
                                    aria-label="New member role"
                                    value={role}
                                    onValueChange={(v) =>
                                        setRole(v as 'editor' | 'viewer')
                                    }
                                    options={ROLE_OPTIONS}
                                />
                                <Button type="submit">Add</Button>
                            </form>
                        ) : null}
                    </div>
                )}
                {error ? (
                    <p role="alert" className="text-sm text-red-500">
                        {error}
                    </p>
                ) : null}
            </DialogContent>
        </Dialog>
    );
};
