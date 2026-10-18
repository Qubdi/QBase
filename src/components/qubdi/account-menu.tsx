import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Database,
    FolderKanban,
    KeyRound,
    LogOut,
    RefreshCw,
    Share2,
    ShieldCheck,
    Smartphone,
    UserRound,
    Users,
} from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import { useDiagram } from '@/hooks/use-diagram';
import { useMfaAvailable } from '@/hooks/use-mfa-available';
import { useQubdi } from '@/hooks/use-qubdi';
import { getProjectId } from '@/lib/qubdi/remote-map';
import { AuthDialog } from './auth-dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import { ConnectionsDialog } from './connections-dialog';
import { MembersDialog } from './members-dialog';
import { OPEN_RESYNC_EVENT } from './drift-dialog';
import { ResyncDialog } from './resync-dialog';
import { ShareDialog } from './share-dialog';
import { TwoFactorDialog } from './two-factor-dialog';
import { useWorkspace } from './workspace-context';

export const AccountMenu: React.FC = () => {
    const { enabled, user, logout, syncDiagram, remoteIdFor } = useQubdi();
    const { currentDiagram } = useDiagram();
    const workspace = useWorkspace();
    const navigate = useNavigate();
    const [authOpen, setAuthOpen] = useState(false);
    const [connectionsOpen, setConnectionsOpen] = useState(false);
    const [membersOpen, setMembersOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [twoFactorOpen, setTwoFactorOpen] = useState(false);
    const mfaAvailable = useMfaAvailable(!!user);
    const [shareOpen, setShareOpen] = useState(false);
    const [resyncOpen, setResyncOpen] = useState(false);

    // the drift report page asks for a re-sync through this event
    useEffect(() => {
        const open = () => setResyncOpen(true);
        window.addEventListener(OPEN_RESYNC_EVENT, open);
        return () => window.removeEventListener(OPEN_RESYNC_EVENT, open);
    }, []);

    if (!enabled || user === undefined) return null;

    // saved connections belong to a project, and only its editors can use them
    const legacyProjectId = workspace
        ? undefined
        : getProjectId(currentDiagram.id);
    const connectionsProject = workspace
        ? workspace.project.role === 'viewer'
            ? null
            : workspace.project
        : legacyProjectId
          ? { id: legacyProjectId, name: 'this project' }
          : null;

    if (user === null) {
        return (
            <>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAuthOpen(true)}
                >
                    Sign in
                </Button>
                <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
            </>
        );
    }

    return (
        <>
            {user.isAdmin ? (
                <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1"
                    onClick={() => navigate('/admin')}
                >
                    <ShieldCheck className="size-4" />
                    Admin
                </Button>
            ) : null}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                        <UserRound className="size-4" />
                        <span className="max-w-32 truncate">{user.email}</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                        {user.email}
                        {user.isAdmin ? ' (admin)' : ''}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/')}>
                        <FolderKanban className="mr-2 size-4" />
                        Projects
                    </DropdownMenuItem>
                    {connectionsProject ? (
                        <DropdownMenuItem
                            onClick={() => setConnectionsOpen(true)}
                        >
                            <Database className="mr-2 size-4" />
                            Database connections
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => setResyncOpen(true)}>
                        <RefreshCw className="mr-2 size-4" />
                        Re-sync from database
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShareOpen(true)}>
                        <Share2 className="mr-2 size-4" />
                        Share
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMembersOpen(true)}>
                        <Users className="mr-2 size-4" />
                        Members
                    </DropdownMenuItem>
                    {user.isAdmin ? (
                        <DropdownMenuItem onClick={() => navigate('/admin')}>
                            <ShieldCheck className="mr-2 size-4" />
                            Admin panel
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
                        <KeyRound className="mr-2 size-4" />
                        Change password
                    </DropdownMenuItem>
                    {mfaAvailable || user.mfaEnabled ? (
                        <DropdownMenuItem
                            onClick={() => setTwoFactorOpen(true)}
                        >
                            <Smartphone className="mr-2 size-4" />
                            Two-factor authentication
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void logout()}>
                        <LogOut className="mr-2 size-4" />
                        Sign out
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <MembersDialog
                open={membersOpen}
                onOpenChange={setMembersOpen}
                remoteId={remoteIdFor(currentDiagram.id)}
            />
            {connectionsProject ? (
                <ConnectionsDialog
                    open={connectionsOpen}
                    onOpenChange={setConnectionsOpen}
                    project={connectionsProject}
                />
            ) : null}
            <ResyncDialog open={resyncOpen} onOpenChange={setResyncOpen} />
            <ShareDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                ensureRemoteId={() => syncDiagram(currentDiagram)}
            />
            <ChangePasswordDialog
                open={passwordOpen}
                onOpenChange={setPasswordOpen}
            />
            {mfaAvailable || user.mfaEnabled ? (
                <TwoFactorDialog
                    open={twoFactorOpen}
                    onOpenChange={setTwoFactorOpen}
                />
            ) : null}
        </>
    );
};
