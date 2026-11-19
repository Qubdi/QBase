import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { errorMessage } from '@/lib/qubdi/api';
import { PasswordField } from '@/components/qubdi/password-field';
import { usePasswordMinLength } from '@/hooks/use-password-min-length';
import { useQubdi } from '@/hooks/use-qubdi';
import { checkPassword } from '../../../shared/password';
import { ProofFields } from './proof-fields';

export interface NewUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Creates the account. Throws when the server refuses, e.g. the email is taken. */
    onCreate: (user: {
        email: string;
        password: string;
        isAdmin: boolean;
        /** the acting admin's own proof, sent only when the new account is an admin */
        adminPassword?: string;
        adminCode?: string;
    }) => Promise<void>;
}

/** Asks for the email and a temporary password of a new account, and says why if it is refused. */
export const NewUserDialog: React.FC<NewUserDialogProps> = ({
    open,
    onOpenChange,
    onCreate,
}) => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    // making an administrator asks for the acting admin's own password (and code)
    const { user: me } = useQubdi();
    const needsOwnCode = me?.mfaEnabled === true;
    const [ownPassword, setOwnPassword] = useState('');
    const [ownCode, setOwnCode] = useState('');
    const proofMissing =
        isAdmin &&
        (ownPassword === '' || (needsOwnCode && ownCode.trim() === ''));
    const minLength = usePasswordMinLength(open);
    const weak =
        checkPassword(password, { minLength, email: email.trim() }).length > 0;

    // each time it opens it is a blank form, so a password never lingers
    const [wasOpen, setWasOpen] = useState(open);
    if (wasOpen !== open) {
        setWasOpen(open);
        if (open) {
            setEmail('');
            setPassword('');
            setIsAdmin(false);
            setOwnPassword('');
            setOwnCode('');
            setError(null);
        }
    }

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await onCreate({
                email: email.trim(),
                password,
                isAdmin,
                ...(isAdmin
                    ? {
                          adminPassword: ownPassword,
                          ...(needsOwnCode
                              ? { adminCode: ownCode.trim() }
                              : {}),
                      }
                    : {}),
            });
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
                    <DialogTitle>
                        {t('qubdi.adminUsers.newUser.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('qubdi.adminUsers.newUser.description')}
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="flex flex-col gap-3"
                    aria-label={t('qubdi.adminUsers.newUser.formLabel')}
                    onSubmit={(e) => void submit(e)}
                >
                    <Input
                        type="email"
                        aria-label={t('qubdi.adminUsers.newUser.email')}
                        placeholder={t('qubdi.adminUsers.newUser.email')}
                        autoComplete="off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog opened on request; focus goes to its first field
                        autoFocus
                    />
                    <PasswordField
                        placeholder={t(
                            'qubdi.adminUsers.newUser.temporaryPassword'
                        )}
                        value={password}
                        onChange={setPassword}
                        minLength={minLength}
                        email={email.trim()}
                    />
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={isAdmin}
                            onChange={(e) => setIsAdmin(e.target.checked)}
                        />
                        {t('qubdi.adminUsers.newUser.makeAdmin')}
                    </label>
                    {isAdmin ? (
                        <ProofFields
                            message={t(
                                needsOwnCode
                                    ? 'qubdi.adminUsers.users.confirmGrantCode'
                                    : 'qubdi.adminUsers.users.confirmGrant'
                            )}
                            needsCode={needsOwnCode}
                            password={ownPassword}
                            onPassword={setOwnPassword}
                            code={ownCode}
                            onCode={setOwnCode}
                        />
                    ) : null}
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
                            {t('qubdi.adminUsers.newUser.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                busy || !email.trim() || weak || proofMissing
                            }
                        >
                            {t('qubdi.adminUsers.newUser.create')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
