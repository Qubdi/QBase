import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button/button';
import { api } from '@/lib/qubdi/api';
import { AuthDialog } from './auth-dialog';

/**
 * Text and button shown to a signed-out visitor. A brand-new server has no
 * users yet, so it points at creating the admin account instead of telling
 * the visitor to ask an admin for one.
 */
export const SignInPrompt: React.FC<{ verb: 'see' | 'open' }> = ({ verb }) => {
    const { t } = useTranslation();
    const [authOpen, setAuthOpen] = useState(false);
    const [needsSetup, setNeedsSetup] = useState(false);

    useEffect(() => {
        api.setupStatus()
            .then((r) => setNeedsSetup(r.needsSetup))
            .catch(() => setNeedsSetup(false));
    }, []);

    return (
        <>
            <p className="max-w-sm text-sm text-muted-foreground">
                {needsSetup
                    ? t('qubdi.account.signInPrompt.needsSetup')
                    : verb === 'see'
                      ? t('qubdi.account.signInPrompt.signInSee')
                      : t('qubdi.account.signInPrompt.signInOpen')}
            </p>
            <Button onClick={() => setAuthOpen(true)}>
                {needsSetup
                    ? t('qubdi.account.signInPrompt.createAdmin')
                    : t('qubdi.account.signInPrompt.signIn')}
            </Button>
            <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
        </>
    );
};
