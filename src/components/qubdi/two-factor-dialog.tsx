import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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

/**
 * Setting up, looking at and turning off two-factor sign-in with an
 * authenticator app. The QR code is drawn here, in the browser, from the
 * address the server sent: the key goes to no one else.
 */
export const TwoFactorDialog: React.FC<TwoFactorDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation();
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
        // the library loads here, as setup starts: most visits never need it
        import('qrcode')
            .then(({ default: QRCode }) =>
                QRCode.toDataURL(otpauthUrl, { margin: 1, width: 192 })
            )
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
        `${t('qubdi.account.twoFactor.fileHeader')}\n${t('qubdi.account.twoFactor.fileNote')}\n\n${codes.join('\n')}\n`;

    const copyCodes = async (codes: string[]) => {
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            setCopied(true);
        } catch {
            setError(t('qubdi.account.twoFactor.copyFailed'));
        }
    };

    const back = (status: MfaStatus) => {
        reset();
        setView({ kind: 'on', status });
    };

    const titleFor = (v: View) =>
        v.kind === 'codes'
            ? t('qubdi.account.twoFactor.codesTitle')
            : t('qubdi.account.twoFactor.title');

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
                            ? t('qubdi.account.twoFactor.codesDescription')
                            : t('qubdi.account.twoFactor.description')}
                    </DialogDescription>
                </DialogHeader>

                {view.kind === 'loading' ? (
                    <p className="text-sm text-muted-foreground">
                        {t('qubdi.account.twoFactor.loading')}
                    </p>
                ) : null}

                {view.kind === 'unavailable' ? (
                    <p className="text-sm text-muted-foreground">
                        {t('qubdi.account.twoFactor.unavailable')}
                    </p>
                ) : null}

                {view.kind === 'off' ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm">
                            <Trans
                                i18nKey="qubdi.account.twoFactor.offText"
                                components={{ strong: <strong /> }}
                            />
                        </p>
                        <Button
                            onClick={() => void startSetup()}
                            disabled={busy}
                        >
                            {t('qubdi.account.twoFactor.setUp')}
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
                            <li>
                                {t('qubdi.account.twoFactor.stepInstall', {
                                    apps: t(
                                        'qubdi.account.twoFactor.authenticatorApps'
                                    ),
                                })}
                            </li>
                            <li>
                                {t('qubdi.account.twoFactor.stepScan')}
                                <div className="mt-2 flex flex-col items-center gap-2">
                                    {qr ? (
                                        <img
                                            src={qr}
                                            width={192}
                                            height={192}
                                            alt={t(
                                                'qubdi.account.twoFactor.qrAlt'
                                            )}
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
                                {t('qubdi.account.twoFactor.stepType')}
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
                            {t('qubdi.account.twoFactor.turnOn')}
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
                            {t('qubdi.account.twoFactor.cancel')}
                        </Button>
                    </form>
                ) : null}

                {view.kind === 'codes' ? (
                    <div className="flex flex-col gap-3">
                        <ul
                            aria-label={t(
                                'qubdi.account.twoFactor.recoveryCodes'
                            )}
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
                                {copied
                                    ? t('qubdi.account.twoFactor.copied')
                                    : t('qubdi.account.twoFactor.copy')}
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
                                {t('qubdi.account.twoFactor.download')}
                            </Button>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={saved}
                                onCheckedChange={(c) => setSaved(c === true)}
                                aria-label={t(
                                    'qubdi.account.twoFactor.savedLabel'
                                )}
                            />
                            {t('qubdi.account.twoFactor.savedText')}
                        </label>
                        <Button
                            disabled={!saved}
                            onClick={() => {
                                reset();
                                void load();
                            }}
                        >
                            {t('qubdi.account.twoFactor.done')}
                        </Button>
                    </div>
                ) : null}

                {view.kind === 'on' ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm">
                            <Trans
                                i18nKey="qubdi.account.twoFactor.onText"
                                components={{ strong: <strong /> }}
                                values={{
                                    since: view.status.enabledAt
                                        ? t('qubdi.account.twoFactor.since', {
                                              time: exactTime(
                                                  view.status.enabledAt
                                              ),
                                          })
                                        : '',
                                    left: t(
                                        'qubdi.account.twoFactor.codesLeft',
                                        {
                                            count: view.status
                                                .recoveryCodesLeft,
                                        }
                                    ),
                                }}
                            />
                        </p>
                        <Button
                            variant="outline"
                            onClick={() => {
                                reset();
                                setView({ kind: 'renew', status: view.status });
                            }}
                        >
                            {t('qubdi.account.twoFactor.renewCodes')}
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
                            {t('qubdi.account.twoFactor.turnOff')}
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
                                ? t('qubdi.account.twoFactor.renewHelp')
                                : t('qubdi.account.twoFactor.disableHelp')}
                        </p>
                        <Input
                            type="password"
                            placeholder={t('qubdi.account.twoFactor.password')}
                            aria-label={t('qubdi.account.twoFactor.password')}
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
                                label={t('qubdi.account.twoFactor.factor')}
                                placeholder={t(
                                    'qubdi.account.twoFactor.factor'
                                )}
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
                                ? t('qubdi.account.twoFactor.renewCodes')
                                : t('qubdi.account.twoFactor.turnOffTwoFactor')}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => back(view.status)}
                        >
                            {t('qubdi.account.twoFactor.cancel')}
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
