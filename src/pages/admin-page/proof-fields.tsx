import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/platform/ui/input';
import { PasswordInput } from '@/components/qubdi/password-input';

/** What an admin action sends to prove it is the admin asking, not a stolen session. */
export interface OwnProof {
    adminPassword: string;
    adminCode?: string;
}

/**
 * The acting admin's own password, and a code when their account has two-factor
 * on. `message` says what the proof is for.
 */
export const ProofFields: React.FC<{
    message: string;
    needsCode: boolean;
    password: string;
    onPassword: (v: string) => void;
    code: string;
    onCode: (v: string) => void;
}> = ({ message, needsCode, password, onPassword, code, onCode }) => {
    const { t } = useTranslation();
    return (
        <>
            <p className="text-sm text-muted-foreground">{message}</p>
            <PasswordInput
                autoComplete="current-password"
                placeholder={t('qubdi.adminUsers.users.ownPassword')}
                aria-label={t('qubdi.adminUsers.users.ownPassword')}
                value={password}
                onChange={(e) => onPassword(e.target.value)}
            />
            {needsCode ? (
                <Input
                    type="text"
                    autoComplete="one-time-code"
                    placeholder={t('qubdi.adminUsers.users.ownCode')}
                    aria-label={t('qubdi.adminUsers.users.ownCode')}
                    value={code}
                    onChange={(e) => onCode(e.target.value)}
                />
            ) : null}
        </>
    );
};
