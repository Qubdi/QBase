import React, { useEffect, useState } from 'react';
import {
    CloudUpload,
    Database,
    KeyRound,
    LogOut,
    RefreshCw,
    Share2,
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
import { useToast } from '@/components/toast/use-toast';
import { useChartDB } from '@/hooks/use-chartdb';
import { useQubdi } from '@/hooks/use-qubdi';
import { errorMessage } from '@/lib/qubdi/api';
import { AuthDialog } from './auth-dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import { ImportFromDatabaseDialog } from './import-from-database-dialog';
import { MembersDialog } from './members-dialog';
import { OPEN_RESYNC_EVENT } from './drift-dialog';
import { ResyncDialog } from './resync-dialog';
import { ShareDialog } from './share-dialog';

export const AccountMenu: React.FC = () => {
    const { enabled, user, logout, syncDiagram, remoteIdFor } = useQubdi();
    const { currentDiagram } = useChartDB();
    const { toast } = useToast();
    const [authOpen, setAuthOpen] = useState(false);
    const [membersOpen, setMembersOpen] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
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

    const sync = async () => {
        try {
            await syncDiagram(currentDiagram);
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
                    <DropdownMenuItem onClick={sync}>
                        <CloudUpload className="mr-2 size-4" />
                        Sync to server
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
            <ImportFromDatabaseDialog
                open={importOpen}
                onOpenChange={setImportOpen}
            />
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
