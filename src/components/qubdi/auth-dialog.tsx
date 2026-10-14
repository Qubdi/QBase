import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { errorMessage } from '@/lib/qubdi/api';
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
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

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
                        {mode === 'login' ? 'Sign in' : 'Create account'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'login'
                            ? 'Sign in to sync diagrams to your QubdiDB server.'
                            : 'The first account on a server becomes its admin.'}
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
                        {mode === 'login' ? 'Sign in' : 'Create account'}
                    </Button>
                    <button
                        type="button"
                        className="text-sm text-muted-foreground underline"
                        onClick={() => {
                            setError(null);
                            setMode(mode === 'login' ? 'register' : 'login');
                        }}
                    >
                        {mode === 'login'
                            ? 'No account? Create one'
                            : 'Already have an account? Sign in'}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
