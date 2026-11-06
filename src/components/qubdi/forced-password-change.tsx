import React from 'react';
import { useQubdi } from '@/hooks/use-qubdi';
import { ChangePasswordDialog } from './change-password-dialog';

/**
 * Opens over every page for someone whose password is a temporary one an admin
 * chose. The server refuses everything else for them until they set their own,
 * so there is nothing behind it to use anyway.
 */
export const ForcedPasswordChange: React.FC = () => {
    const { user, refreshUser } = useQubdi();
    return (
        <ChangePasswordDialog
            open={user?.mustChangePassword === true}
            onOpenChange={() => undefined}
            forced
            onChanged={() => void refreshUser().catch(() => undefined)}
        />
    );
};
