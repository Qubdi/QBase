import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { usePasswordMinLength } from '@/hooks/use-password-min-length';
import { factorFrom } from '@/lib/qubdi/second-factor';
import { CodeField } from './code-field';
import { PasswordField } from './password-field';
import { checkPassword } from '../../../shared/password';

export interface ChangePasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * The password is a temporary one an admin chose: the person must set their
     * own before anything else works, so the dialog cannot be dismissed and
     * offers signing out instead.
     */
    forced?: boolean;
    /** called once the password was changed */
    onChanged?: () => void;
}

export const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({
    open,
    onOpenChange,
    forced = false,
    onChanged,
}) => {
    const { t } = useTranslation();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    // with two-factor on, a code (or a recovery code) goes with the change
    const [factor, setFactor] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    const sending = useRef(false);
    const { user, logout } = useQubdi();
    const minLength = usePasswordMinLength(open);
    const weak =
        checkPassword(next, { minLength, email: user?.email }).length > 0;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        // a second submit while the first is on its way would reuse a one-time code
        if (sending.current) return;
        sending.current = true;
        setBusy(true);
        setError(null);
        try {
            if (user?.mfaEnabled) {
                await api.changePassword(current, next, factorFrom(factor));
            } else {
                await api.changePassword(current, next);
            }
            setDone(true);
            setCurrent('');
            setNext('');
            setFactor('');
            onChanged?.();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            sending.current = false;
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (forced && !o) return;
                if (!o) setDone(false);
                onOpenChange(o);
            }}
        >
            <DialogContent
                className="max-w-sm"
                showClose={!forced}
                onEscapeKeyDown={forced ? (e) => e.preventDefault() : undefined}
                onInteractOutside={
                    forced ? (e) => e.preventDefault() : undefined
                }
            >
                <DialogHeader>
                    <DialogTitle>
                        {forced
                            ? t('qubdi.account.changePassword.forcedTitle')
                            : t('qubdi.account.changePassword.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {forced
                            ? t(
                                  'qubdi.account.changePassword.forcedDescription'
                              )
                            : t('qubdi.account.changePassword.description')}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="flex flex-col gap-3">
                    <Input
                        type="password"
                        placeholder={t(
                            'qubdi.account.changePassword.currentPassword'
                        )}
                        autoComplete="current-password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        required
                    />
                    <PasswordField
                        value={next}
                        onChange={setNext}
                        minLength={minLength}
                        email={user?.email}
                        placeholder={t(
                            'qubdi.account.changePassword.newPassword'
                        )}
                    />
                    {user?.mfaEnabled ? (
                        <CodeField
                            value={factor}
                            onChange={setFactor}
                            either
                            placeholder={t(
                                'qubdi.account.changePassword.factor'
                            )}
                            label={t('qubdi.account.changePassword.factor')}
                        />
                    ) : null}
                    {error ? (
                        <p role="alert" className="text-sm text-red-500">
                            {error}
                        </p>
                    ) : null}
                    {done ? (
                        <p className="text-sm text-green-600">
                            {t('qubdi.account.changePassword.done')}
                        </p>
                    ) : null}
                    <Button type="submit" disabled={weak || busy}>
                        {t('qubdi.account.changePassword.submit')}
                    </Button>
                    {forced ? (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void logout()}
                        >
                            {t('qubdi.account.changePassword.signOut')}
                        </Button>
                    ) : null}
                </form>
            </DialogContent>
        </Dialog>
    );
};
