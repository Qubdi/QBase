import React, { useEffect, useState } from 'react';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { errorMessage } from '@/lib/qubdi/api';

export interface NewUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Creates the account. Throws when the server refuses, e.g. the email is taken. */
    onCreate: (user: {
        email: string;
        password: string;
        isAdmin: boolean;
    }) => Promise<void>;
}

/** Asks for the email and a temporary password of a new account, and says why if it is refused. */
export const NewUserDialog: React.FC<NewUserDialogProps> = ({
    open,
    onOpenChange,
    onCreate,
}) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // each time it opens it is a blank form, so a password never lingers
    useEffect(() => {
        if (open) {
            setEmail('');
            setPassword('');
            setIsAdmin(false);
            setError(null);
        }
    }, [open]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await onCreate({ email: email.trim(), password, isAdmin });
            onOpenChange(false);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
            <DialogContent className="max-w-md" showClose>
                <DialogHeader>
                    <DialogTitle>New user</DialogTitle>
                    <DialogDescription>
                        People cannot sign themselves up. Create their account
                        here, then assign them to projects.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="flex flex-col gap-3"
                    aria-label="Create user"
                    onSubmit={(e) => void submit(e)}
                >
                    <Input
                        type="email"
                        aria-label="Email"
                        placeholder="Email"
                        autoComplete="off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                    />
                    <Input
                        type="password"
                        aria-label="Temporary password"
                        placeholder="Temporary password (min 8)"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={8}
                        required
                    />
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={isAdmin}
                            onChange={(e) => setIsAdmin(e.target.checked)}
                        />
                        Make this user an admin
                    </label>
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={busy || !email.trim() || !password}
                        >
                            Create user
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
