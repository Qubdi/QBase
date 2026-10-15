import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { api, errorMessage } from '@/lib/qubdi/api';
import { useQubdi } from '@/hooks/use-qubdi';

export interface AuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const { login, register } = useQubdi();
    // self-registration only exists on a brand-new server, to create its admin
    const [needsSetup, setNeedsSetup] = useState(false);
    const mode = needsSetup ? 'register' : 'login';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        api.setupStatus()
            .then((r) => setNeedsSetup(r.needsSetup))
            .catch(() => setNeedsSetup(false));
    }, [open]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await (mode === 'login' ? login : register)(email, password);
            setPassword('');
            onOpenChange(false);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm" showClose>
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'login' ? 'Sign in' : 'Create admin account'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'login'
                            ? 'Sign in to sync diagrams to your QubdiDB server. Accounts are created by an admin.'
                            : 'This server has no users yet. The first account becomes its admin and can create everyone else.'}
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={submit}
                    className="flex flex-col gap-3"
                    data-testid="auth-form"
                >
                    <Input
                        type="email"
                        placeholder="Email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <Input
                        type="password"
                        placeholder="Password (min 8 characters)"
                        autoComplete={
                            mode === 'login'
                                ? 'current-password'
                                : 'new-password'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={8}
                        required
                    />
                    {error ? (
                        <p role="alert" className="text-sm text-red-500">
                            {error}
                        </p>
                    ) : null}
                    <Button type="submit" disabled={busy}>
                        {mode === 'login' ? 'Sign in' : 'Create admin account'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
