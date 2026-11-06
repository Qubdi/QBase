import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { UserPicker } from '@/components/qubdi/user-picker';
import type { AdminUser, ProjectMember, ProjectRole } from '@/lib/qubdi/api';

const ROLE_HELP_KEYS: Record<ProjectRole, string> = {
    editor: 'helpEditor',
    viewer: 'helpViewer',
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
    const { t } = useTranslation();
    const roleOptions = [
        { value: 'viewer', label: t('qubdi.adminProjects.members.roleViewer') },
        { value: 'editor', label: t('qubdi.adminProjects.members.roleEditor') },
    ];
    const [assignUser, setAssignUser] = useState<AdminUser | null>(null);
    const [assignRole, setAssignRole] = useState<ProjectRole>('viewer');

    const memberIds = useMemo(
        () => new Set(members.map((m) => m.userId)),
        [members]
    );

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
                {t('qubdi.adminProjects.members.intro')}
            </p>

            <form
                className="flex flex-col gap-2 md:flex-row"
                aria-label={t('qubdi.adminProjects.members.addPerson')}
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
                    aria-label={t('qubdi.adminProjects.members.permissionNew')}
                    className="w-full md:w-32"
                    value={assignRole}
                    onValueChange={(v) => setAssignRole(v as ProjectRole)}
                    options={roleOptions}
                />
                <Button type="submit" disabled={busy || !assignUser}>
                    {t('qubdi.adminProjects.members.assign')}
                </Button>
            </form>
            <p className="-mt-2 text-xs text-muted-foreground">
                {t(`qubdi.adminProjects.members.${ROLE_HELP_KEYS[assignRole]}`)}
            </p>

            <ul
                className="flex flex-col divide-y"
                aria-label={t('qubdi.adminProjects.members.assignedUsers')}
            >
                {members.length === 0 ? (
                    <li className="py-2 text-sm text-muted-foreground">
                        {t('qubdi.adminProjects.members.nobody')}
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
                                    aria-label={t(
                                        'qubdi.adminProjects.members.permissionFor',
                                        {
                                            email: m.email,
                                        }
                                    )}
                                    value={m.role}
                                    disabled={busy}
                                    onValueChange={(v) =>
                                        onChangeRole(m, v as ProjectRole)
                                    }
                                    options={roleOptions}
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy}
                                    aria-label={t(
                                        'qubdi.adminProjects.members.removeLabel',
                                        {
                                            email: m.email,
                                        }
                                    )}
                                    onClick={() => onRemove(m)}
                                >
                                    {t('qubdi.adminProjects.members.remove')}
                                </Button>
                            </span>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
};
