import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CloudUpload,
    Database,
    FolderOpen,
    KeyRound,
    LogOut,
    RefreshCw,
    Share2,
    ShieldCheck,
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
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import { useToast } from '@/components/toast/use-toast';
import { useChartDB } from '@/hooks/use-chartdb';
import { useQubdi } from '@/hooks/use-qubdi';
import { api, errorMessage, type MyProject } from '@/lib/qubdi/api';
import { AuthDialog } from './auth-dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import { ImportFromDatabaseDialog } from './import-from-database-dialog';
import { MembersDialog } from './members-dialog';
import { getProjectId } from '@/lib/qubdi/remote-map';
import { OpenFromServerDialog } from './open-from-server-dialog';
import { OPEN_RESYNC_EVENT } from './drift-dialog';
import { ResyncDialog } from './resync-dialog';
import { ShareDialog } from './share-dialog';

export const AccountMenu: React.FC = () => {
    const { enabled, user, logout, syncDiagram, remoteIdFor } = useQubdi();
    const { currentDiagram } = useChartDB();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [projects, setProjects] = useState<MyProject[]>([]);
    const [authOpen, setAuthOpen] = useState(false);
    const [membersOpen, setMembersOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [openServerOpen, setOpenServerOpen] = useState(false);
    const [resyncOpen, setResyncOpen] = useState(false);
    const [, forceRender] = useState(0);

    // the drift report page asks for a re-sync through this event
    useEffect(() => {
        const open = () => setResyncOpen(true);
        window.addEventListener(OPEN_RESYNC_EVENT, open);
        return () => window.removeEventListener(OPEN_RESYNC_EVENT, open);
    }, []);

    if (!enabled || user === undefined) return null;

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

    // only projects where the user can write are valid sync targets
    const loadProjects = (open: boolean) => {
        if (!open) return;
        api.listProjects()
            .then((list) =>
                setProjects(list.filter((p) => p.role !== 'viewer'))
            )
            .catch(() => setProjects([]));
    };

    const sync = async (projectId?: string) => {
        try {
            await syncDiagram(currentDiagram, projectId);
            forceRender((n) => n + 1);
            toast({ title: 'Synced to server' });
        } catch (e) {
            toast({
                title: 'Sync failed',
                description: errorMessage(e),
                variant: 'destructive',
            });
        }
    };

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
            <DropdownMenu onOpenChange={loadProjects}>
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
                    {remoteIdFor(currentDiagram.id) || projects.length === 0 ? (
                        <DropdownMenuItem onClick={() => void sync()}>
                            <CloudUpload className="mr-2 size-4" />
                            Sync to server
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <CloudUpload className="mr-2 size-4" />
                                Sync to server
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                <DropdownMenuLabel>
                                    Save into a project
                                </DropdownMenuLabel>
                                {projects.map((p) => (
                                    <DropdownMenuItem
                                        key={p.id}
                                        onClick={() => void sync(p.id)}
                                    >
                                        {p.name}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => void sync()}>
                                    Only me (personal)
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    )}
                    <DropdownMenuItem onClick={() => setOpenServerOpen(true)}>
                        <FolderOpen className="mr-2 size-4" />
                        Open from server
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setImportOpen(true)}>
                        <Database className="mr-2 size-4" />
                        Import from database
                    </DropdownMenuItem>
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
                currentUserId={user.id}
            />
            <OpenFromServerDialog
                open={openServerOpen}
                onOpenChange={setOpenServerOpen}
            />
            {getProjectId(currentDiagram.id) ? (
                <ImportFromDatabaseDialog
                    open={importOpen}
                    onOpenChange={setImportOpen}
                    projectId={getProjectId(currentDiagram.id)!}
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
        </>
    );
};
