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
import { api, errorMessage } from '@/lib/qubdi/api';

export interface ChangePasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            await api.changePassword(current, next);
            setDone(true);
            setCurrent('');
            setNext('');
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) setDone(false);
                onOpenChange(o);
            }}
        >
            <DialogContent className="max-w-sm" showClose>
                <DialogHeader>
                    <DialogTitle>Change password</DialogTitle>
                    <DialogDescription>
                        Enter your current password and choose a new one.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="flex flex-col gap-3">
                    <Input
                        type="password"
                        placeholder="Current password"
                        autoComplete="current-password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        required
                    />
                    <Input
                        type="password"
                        placeholder="New password (min 8 characters)"
                        autoComplete="new-password"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        minLength={8}
                        required
                    />
                    {error ? (
                        <p role="alert" className="text-sm text-red-500">
                            {error}
                        </p>
                    ) : null}
                    {done ? (
                        <p className="text-sm text-green-600">
                            Password changed. Other devices were signed out.
                        </p>
                    ) : null}
                    <Button type="submit">Change password</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
