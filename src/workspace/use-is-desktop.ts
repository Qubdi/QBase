import { useEffect, useState } from 'react';

/** The width from which the desktop layout is used (spec 1.1). */
export const DESKTOP_QUERY = '(min-width: 768px)';

const read = (): boolean => {
    try {
        return window.matchMedia(DESKTOP_QUERY).matches;
    } catch {
        return true;
    }
};

/** True at 768 px and wider; follows the window as it is resized. */
export function useIsDesktop(): boolean {
    const [desktop, setDesktop] = useState(read);
    useEffect(() => {
        let media: MediaQueryList;
        try {
            media = window.matchMedia(DESKTOP_QUERY);
        } catch {
            return;
        }
        const update = () => setDesktop(media.matches);
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    return desktop;
}
