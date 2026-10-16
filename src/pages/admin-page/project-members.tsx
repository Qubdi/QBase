import React, { useMemo, useState } from 'react';
import { Button } from '@/components/button/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { UserPicker } from '@/components/qubdi/user-picker';
import type { AdminUser, ProjectMember, ProjectRole } from '@/lib/qubdi/api';

const ROLE_OPTIONS = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'editor', label: 'Editor' },
];

const ROLE_HELP: Record<ProjectRole, string> = {
    editor: 'Can create and edit diagrams in this project',
    viewer: 'Can only read published diagrams',
};

export interface ProjectMembersProps {
    members: ProjectMember[];
    busy: boolean;
    onAssign: (user: AdminUser, role: ProjectRole) => Promise<boolean>;
    onChangeRole: (member: ProjectMember, role: ProjectRole) => void;
    onRemove: (member: ProjectMember) => void;
}

/** Who can open the project: add a person, change a role, or take access away. */
export const ProjectMembers: React.FC<ProjectMembersProps> = ({
    members,
    busy,
    onAssign,
    onChangeRole,
    onRemove,
}) => {
    const [assignUser, setAssignUser] = useState<AdminUser | null>(null);
    const [assignRole, setAssignRole] = useState<ProjectRole>('viewer');

    const memberIds = useMemo(
        () => new Set(members.map((m) => m.userId)),
        [members]
    );

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
                Admins always have full access. Everyone else only sees the
                projects they are assigned to.
            </p>

            <form
                className="flex flex-col gap-2 md:flex-row"
                aria-label="Add a person"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!assignUser) return;
                    void onAssign(assignUser, assignRole).then((ok) => {
                        if (ok) setAssignUser(null);
                    });
                }}
            >
                <div className="md:flex-1">
                    <UserPicker
                        selected={assignUser}
                        onSelect={setAssignUser}
                        excludeIds={memberIds}
                        hideAdmins
                    />
                </div>
                <OptionSelect
                    aria-label="Permission for new member"
                    className="w-full md:w-32"
                    value={assignRole}
                    onValueChange={(v) => setAssignRole(v as ProjectRole)}
                    options={ROLE_OPTIONS}
                />
                <Button type="submit" disabled={busy || !assignUser}>
                    Assign
                </Button>
            </form>
            <p className="-mt-2 text-xs text-muted-foreground">
                {ROLE_HELP[assignRole]}
            </p>

            <ul className="flex flex-col divide-y" aria-label="Assigned users">
                {members.length === 0 ? (
                    <li className="py-2 text-sm text-muted-foreground">
                        Nobody is assigned yet. Search for a person above to
                        give them access.
                    </li>
                ) : (
                    members.map((m) => (
                        <li
                            key={m.userId}
                            className="flex items-center justify-between gap-2 py-2 text-sm"
                        >
                            <span className="truncate">{m.email}</span>
                            <span className="flex items-center gap-2">
                                <OptionSelect
                                    size="sm"
                                    className="w-28"
                                    aria-label={`Permission for ${m.email}`}
                                    value={m.role}
                                    disabled={busy}
                                    onValueChange={(v) =>
                                        onChangeRole(m, v as ProjectRole)
                                    }
                                    options={ROLE_OPTIONS}
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy}
                                    aria-label={`Remove ${m.email}`}
                                    onClick={() => onRemove(m)}
                                >
                                    Remove
                                </Button>
                            </span>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
};
