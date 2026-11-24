import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { api, ApiError, errorMessage } from '@/lib/qubdi/api';
import { codeDigits, isCode } from '@/lib/qubdi/second-factor';
import { useQubdi } from '@/hooks/use-qubdi';
import { usePasswordMinLength } from '@/hooks/use-password-min-length';
import { CodeField } from './code-field';
import { PasswordField } from './password-field';
import { checkPassword } from '../../../shared/password';
import { PasswordInput } from './password-input';

export interface AuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation();
    const { login, loginMfa, register } = useQubdi();
    // self-registration only exists on a brand-new server, to create its admin
    const [needsSetup, setNeedsSetup] = useState(false);
    // the server asks for a token it printed in its log before it makes the first admin
    const [tokenRequired, setTokenRequired] = useState(false);
    const [setupToken, setSetupToken] = useState('');
    const mode = needsSetup ? 'register' : 'login';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    // the second step of signing in, once the password was right
    const [challenge, setChallenge] = useState<string | null>(null);
    const [recovery, setRecovery] = useState(false);
    const [code, setCode] = useState('');
    // the server has no SETUP_TOKEN yet, so creating the first account would be refused
    const [tokenMissing, setTokenMissing] = useState(false);
    const minLength = usePasswordMinLength(open);
    // the rules apply to a password being chosen, never to signing in
    const weak =
        mode === 'register' &&
        checkPassword(password, { minLength, email }).length > 0;

    useEffect(() => {
        if (!open) return;
        api.setupStatus()
            .then((r) => {
                setNeedsSetup(r.needsSetup);
                setTokenRequired(r.needsSetup && r.setupTokenRequired === true);
                setTokenMissing(
                    r.needsSetup && r.setupTokenConfigured === false
                );
            })
            .catch(() => {
                setNeedsSetup(false);
                setTokenRequired(false);
                setTokenMissing(false);
            });
    }, [open]);

    const close = (o: boolean) => {
        if (!o) leaveCodeStep();
        onOpenChange(o);
    };

    const leaveCodeStep = () => {
        setChallenge(null);
        setRecovery(false);
        setCode('');
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const result =
                mode === 'login'
                    ? await login(email, password)
                    : tokenRequired
                      ? await register(email, password, setupToken.trim())
                      : await register(email, password);
            if (result && 'mfaChallenge' in result) {
                setChallenge(result.mfaChallenge);
                setPassword('');
                return;
            }
            setPassword('');
            setSetupToken('');
            onOpenChange(false);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const submitCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!challenge) return;
        setBusy(true);
        setError(null);
        try {
            await loginMfa(
                challenge,
                recovery
                    ? { recoveryCode: code.trim() }
                    : { code: codeDigits(code) }
            );
            leaveCodeStep();
            onOpenChange(false);
        } catch (err) {
            // the ticket ran out or was used up: only the password can start again
            if (err instanceof ApiError && err.code === 'invalid_challenge') {
                leaveCodeStep();
            }
            setCode('');
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    if (challenge) {
        return (
            <Dialog open={open} onOpenChange={close}>
                <DialogContent className="max-w-sm" showClose>
                    <DialogHeader>
                        <DialogTitle>
                            {t('qubdi.account.authDialog.twoFactorTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {recovery
                                ? t(
                                      'qubdi.account.authDialog.recoveryDescription'
                                  )
                                : t('qubdi.account.authDialog.codeDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={submitCode}
                        className="flex flex-col gap-3"
                        data-testid="mfa-form"
                    >
                        <CodeField
                            value={code}
                            onChange={setCode}
                            recovery={recovery}
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- shown after the password step; the code is what the user types next
                            autoFocus
                        />
                        {error ? (
                            <p role="alert" className="text-sm text-red-500">
                                {error}
                            </p>
                        ) : null}
                        <Button
                            type="submit"
                            disabled={
                                busy ||
                                (recovery ? !code.trim() : !isCode(code))
                            }
                        >
                            {t('qubdi.account.authDialog.verify')}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setRecovery((r) => !r);
                                setCode('');
                                setError(null);
                            }}
                        >
                            {recovery
                                ? t('qubdi.account.authDialog.useAuthenticator')
                                : t('qubdi.account.authDialog.useRecovery')}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                leaveCodeStep();
                                setError(null);
                            }}
                        >
                            {t('qubdi.account.authDialog.back')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-w-sm" showClose>
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'login'
                            ? t('qubdi.account.authDialog.signIn')
                            : t('qubdi.account.authDialog.createAdmin')}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'login'
                            ? t('qubdi.account.authDialog.signInDescription')
                            : t('qubdi.account.authDialog.setupDescription')}
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={submit}
                    className="flex flex-col gap-3"
                    data-testid="auth-form"
                >
                    <Input
                        type="email"
                        placeholder={t('qubdi.account.authDialog.email')}
                        aria-label={t('qubdi.account.authDialog.email')}
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    {mode === 'login' ? (
                        <PasswordInput
                            placeholder={t('qubdi.account.authDialog.password')}
                            aria-label={t('qubdi.account.authDialog.password')}
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    ) : (
                        <PasswordField
                            value={password}
                            onChange={setPassword}
                            minLength={minLength}
                            email={email}
                        />
                    )}
                    {mode === 'register' && tokenRequired ? (
                        <>
                            <Input
                                type="text"
                                placeholder={t(
                                    'qubdi.account.authDialog.setupToken'
                                )}
                                aria-label={t(
                                    'qubdi.account.authDialog.setupToken'
                                )}
                                aria-describedby="setup-token-hint"
                                autoComplete="off"
                                spellCheck={false}
                                value={setupToken}
                                onChange={(e) => setSetupToken(e.target.value)}
                                required
                            />
                            <p
                                id="setup-token-hint"
                                className="text-xs text-muted-foreground"
                            >
                                {t('qubdi.account.authDialog.setupTokenHint')}
                            </p>
                        </>
                    ) : null}
                    {mode === 'register' && tokenMissing ? (
                        <p role="alert" className="text-sm text-red-500">
                            {t('qubdi.account.errors.setup_token_required')}
                        </p>
                    ) : null}
                    {error ? (
                        <p role="alert" className="text-sm text-red-500">
                            {error}
                        </p>
                    ) : null}
                    <Button type="submit" disabled={busy || weak}>
                        {mode === 'login'
                            ? t('qubdi.account.authDialog.signIn')
                            : t('qubdi.account.authDialog.createAdmin')}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
