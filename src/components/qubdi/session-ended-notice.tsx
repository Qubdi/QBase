import React from 'react';
import { useQubdi } from '@/hooks/use-qubdi';

/** Shown on the sign-in screen after the server ended the user's session. */
export const SessionEndedNotice: React.FC = () => {
    const { sessionEnded } = useQubdi();
    if (!sessionEnded) return null;
    return (
        <p
            role="alert"
            className="max-w-sm rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground"
        >
            You were signed out. An account can only be signed in once at a
            time, so it may have been signed in on another device or browser.
        </p>
    );
};
