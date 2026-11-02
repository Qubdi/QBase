import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQubdi } from '@/hooks/use-qubdi';

/** Shown on the sign-in screen after the server ended the user's session. */
export const SessionEndedNotice: React.FC = () => {
    const { t } = useTranslation();
    const { sessionEnded } = useQubdi();
    if (!sessionEnded) return null;
    return (
        <p
            role="alert"
            className="max-w-sm rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground"
        >
            {t('qubdi.account.sessionEnded')}
        </p>
    );
};
