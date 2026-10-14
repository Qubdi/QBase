import type { RemoteUser } from './api';

// Once per browser session an admin who opens the app lands on the admin panel.
// The flag keeps "Back to editor" from bouncing them straight back.
const KEY = 'qubdidb.admin-landed';

const store = () => {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
};

/** True when this visit should be sent to the admin panel (and marks it done). */
export function consumeAdminLanding(
    user: RemoteUser | null | undefined
): boolean {
    if (!user?.isAdmin) return false;
    const s = store();
    // without storage we cannot remember, so never redirect (avoids a loop)
    if (!s) return false;
    try {
        if (s.getItem(KEY)) return false;
        s.setItem(KEY, '1');
        return true;
    } catch {
        return false;
    }
}

/** Call on sign-out so the next admin sign-in lands on the panel again. */
export function resetAdminLanding() {
    try {
        store()?.removeItem(KEY);
    } catch {
        // ignore
    }
}
