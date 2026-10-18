import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { Checkbox } from '@/components/checkbox/checkbox';
import { Input } from '@/components/input/input';
import { api, errorMessage, type MfaStatus } from '@/lib/qubdi/api';
import { saveBlob } from '@/lib/qubdi/save-blob';
import {
    codeDigits,
    factorFrom,
    isCode,
    spacedKey,
} from '@/lib/qubdi/second-factor';
import { useQubdi } from '@/hooks/use-qubdi';
import { exactTime } from '@/lib/qubdi/when';
import { CodeField } from './code-field';

export interface TwoFactorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type View =
    | { kind: 'loading' }
    | { kind: 'unavailable' }
    | { kind: 'off' }
    | { kind: 'setup'; secret: string; otpauthUrl: string }
    // the recovery codes, shown once: the dialog stays open until they are saved
    | { kind: 'codes'; codes: string[] }
    | { kind: 'on'; status: MfaStatus }
    | { kind: 'renew'; status: MfaStatus }
    | { kind: 'disable'; status: MfaStatus };

const AUTHENTICATOR_APPS =
    'Google Authenticator, Microsoft Authenticator, Authy, 1Password or any other authenticator app';

/**
 * Setting up, looking at and turning off two-factor sign-in with an
 * authenticator app. The QR code is drawn here, in the browser, from the
 * address the server sent: the key goes to no one else.
 */
export const TwoFactorDialog: React.FC<TwoFactorDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const { refreshUser } = useQubdi();
    const [view, setView] = useState<View>({ kind: 'loading' });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [saved, setSaved] = useState(false);
    const [copied, setCopied] = useState(false);
    const [qr, setQr] = useState<string | null>(null);

    const reset = () => {
        setError(null);
        setCode('');
        setPassword('');
        setSaved(false);
        setCopied(false);
    };

    const load = useCallback(async () => {
        setView({ kind: 'loading' });
        try {
            const status = await api.mfaStatus();
            setView(
                status.enabled
                    ? { kind: 'on', status }
                    : status.available
                      ? { kind: 'off' }
                      : { kind: 'unavailable' }
            );
        } catch (err) {
            setError(errorMessage(err));
            setView({ kind: 'unavailable' });
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        reset();
        void load();
    }, [open, load]);

    // the picture of the address, made in the browser
    const otpauthUrl = view.kind === 'setup' ? view.otpauthUrl : null;
    useEffect(() => {
        setQr(null);
        if (!otpauthUrl) return;
        let live = true;
        QRCode.toDataURL(otpauthUrl, { margin: 1, width: 192 })
            .then((url) => live && setQr(url))
            .catch(() => undefined);
        return () => {
            live = false;
        };
    }, [otpauthUrl]);

    // the codes are shown once: no closing until the person says they kept them
    const mustKeepCodes = view.kind === 'codes' && !saved;

    const run = async (work: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await work();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const startSetup = () =>
        run(async () => {
            const { secret, otpauthUrl } = await api.mfaSetup();
            setCode('');
            setView({ kind: 'setup', secret, otpauthUrl });
        });

    const turnOn = (e: React.FormEvent) => {
        e.preventDefault();
        void run(async () => {
            const { recoveryCodes } = await api.mfaEnable(codeDigits(code));
            reset();
            setView({ kind: 'codes', codes: recoveryCodes });
            await refreshUser();
        });
    };

    const turnOff = (e: React.FormEvent) => {
        e.preventDefault();
        void run(async () => {
            await api.mfaDisable(password, factorFrom(code));
            reset();
            await refreshUser();
            await load();
        });
    };

    const renew = (e: React.FormEvent) => {
        e.preventDefault();
        void run(async () => {
            const { recoveryCodes } = await api.mfaNewRecoveryCodes(
                password,
                codeDigits(code)
            );
            reset();
            setView({ kind: 'codes', codes: recoveryCodes });
        });
    };

    const codesText = (codes: string[]) =>
        `QubdiDB recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`;

    const copyCodes = async (codes: string[]) => {
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            setCopied(true);
        } catch {
            setError('Copy failed. Select the codes and copy them by hand.');
        }
    };

    const back = (status: MfaStatus) => {
        reset();
        setView({ kind: 'on', status });
    };

    const titleFor = (v: View) =>
        v.kind === 'codes'
            ? 'Save your recovery codes'
            : 'Two-factor authentication';

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o && mustKeepCodes) return;
                onOpenChange(o);
            }}
        >
            <DialogContent
                className="max-w-md"
                showClose={!mustKeepCodes}
                onEscapeKeyDown={
                    mustKeepCodes ? (e) => e.preventDefault() : undefined
                }
                onInteractOutside={
                    mustKeepCodes ? (e) => e.preventDefault() : undefined
                }
            >
                <DialogHeader>
                    <DialogTitle>{titleFor(view)}</DialogTitle>
                    <DialogDescription>
                        {view.kind === 'codes'
                            ? 'Each code works once, if you lose your phone. They are shown only now.'
                            : 'Ask for a code from an app on your phone, as well as the password, when you sign in.'}
                    </DialogDescription>
                </DialogHeader>

                {view.kind === 'loading' ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : null}

                {view.kind === 'unavailable' ? (
                    <p className="text-sm text-muted-foreground">
                        Two-factor sign-in is not available on this server.
                        Whoever runs it can switch it on by setting an
                        encryption key (SECRETS_KEY).
                    </p>
                ) : null}

                {view.kind === 'off' ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm">
                            It is <strong>off</strong>. Turn it on and a stolen
                            password alone will not get anyone into your
                            account.
                        </p>
                        <Button
                            onClick={() => void startSetup()}
                            disabled={busy}
                        >
                            Set up
                        </Button>
                    </div>
                ) : null}

                {view.kind === 'setup' ? (
                    <form
                        onSubmit={turnOn}
                        className="flex flex-col gap-3"
                        data-testid="mfa-setup"
                    >
                        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
                            <li>Install {AUTHENTICATOR_APPS} on your phone.</li>
                            <li>
                                Scan this code with the app, or choose
                                &ldquo;enter a key&rdquo; and type the key
                                below.
                                <div className="mt-2 flex flex-col items-center gap-2">
                                    {qr ? (
                                        <img
                                            src={qr}
                                            width={192}
                                            height={192}
                                            alt="QR code for your authenticator app"
                                            className="rounded bg-white"
                                        />
                                    ) : (
                                        <div className="size-48 animate-pulse rounded bg-muted" />
                                    )}
                                    <code
                                        className="select-all break-all text-center font-mono text-sm"
                                        data-testid="mfa-key"
                                    >
                                        {spacedKey(view.secret)}
                                    </code>
                                </div>
                            </li>
                            <li>
                                Type the 6-digit code the app shows now.
                                <div className="mt-2">
                                    <CodeField
                                        value={code}
                                        onChange={setCode}
                                        autoFocus
                                    />
                                </div>
                            </li>
                        </ol>
                        <Button type="submit" disabled={busy || !isCode(code)}>
                            Turn on
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                reset();
                                setView({ kind: 'off' });
                            }}
                        >
                            Cancel
                        </Button>
                    </form>
                ) : null}

                {view.kind === 'codes' ? (
                    <div className="flex flex-col gap-3">
                        <ul
                            aria-label="Recovery codes"
                            className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-muted/40 p-3 font-mono text-sm"
                        >
                            {view.codes.map((c) => (
                                <li key={c} className="select-all">
                                    {c}
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => void copyCodes(view.codes)}
                            >
                                <Copy className="size-4" />
                                {copied ? 'Copied' : 'Copy'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() =>
                                    saveBlob(
                                        new Blob([codesText(view.codes)], {
                                            type: 'text/plain',
                                        }),
                                        'qubdidb-recovery-codes.txt'
                                    )
                                }
                            >
                                <Download className="size-4" />
                                Download
                            </Button>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={saved}
                                onCheckedChange={(c) => setSaved(c === true)}
                                aria-label="I have saved these codes"
                            />
                            I have saved these codes somewhere safe
                        </label>
                        <Button
                            disabled={!saved}
                            onClick={() => {
                                reset();
                                void load();
                            }}
                        >
                            Done
                        </Button>
                    </div>
                ) : null}

                {view.kind === 'on' ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm">
                            It is <strong>on</strong>
                            {view.status.enabledAt
                                ? ` since ${exactTime(view.status.enabledAt)}`
                                : ''}
                            . You have {view.status.recoveryCodesLeft} unused
                            recovery{' '}
                            {view.status.recoveryCodesLeft === 1
                                ? 'code'
                                : 'codes'}
                            .
                        </p>
                        <Button
                            variant="outline"
                            onClick={() => {
                                reset();
                                setView({ kind: 'renew', status: view.status });
                            }}
                        >
                            Make new recovery codes
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => {
                                reset();
                                setView({
                                    kind: 'disable',
                                    status: view.status,
                                });
                            }}
                        >
                            Turn off
                        </Button>
                    </div>
                ) : null}

                {view.kind === 'renew' || view.kind === 'disable' ? (
                    <form
                        onSubmit={view.kind === 'renew' ? renew : turnOff}
                        className="flex flex-col gap-3"
                        data-testid={`mfa-${view.kind}`}
                    >
                        <p className="text-sm">
                            {view.kind === 'renew'
                                ? 'The old recovery codes stop working. Confirm with your password and a code from the app.'
                                : 'Confirm with your password and a code from the app (or a recovery code).'}
                        </p>
                        <Input
                            type="password"
                            placeholder="Password"
                            aria-label="Password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        {view.kind === 'renew' ? (
                            <CodeField value={code} onChange={setCode} />
                        ) : (
                            <CodeField
                                value={code}
                                onChange={setCode}
                                either
                                label="Authenticator or recovery code"
                                placeholder="Authenticator or recovery code"
                            />
                        )}
                        <Button
                            type="submit"
                            disabled={busy || !password || !code.trim()}
                            variant={
                                view.kind === 'disable'
                                    ? 'destructive'
                                    : 'default'
                            }
                        >
                            {view.kind === 'renew'
                                ? 'Make new recovery codes'
                                : 'Turn off two-factor'}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => back(view.status)}
                        >
                            Cancel
                        </Button>
                    </form>
                ) : null}

                {error ? (
                    <p role="alert" className="text-sm text-red-500">
                        {error}
                    </p>
                ) : null}
            </DialogContent>
        </Dialog>
    );
};
