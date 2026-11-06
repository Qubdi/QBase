import { useEffect, useState } from 'react';
import { loader, type Monaco } from '@monaco-editor/react';

/**
 * Monaco, once the copy bundled with the app is ready; null until then.
 *
 * `./config` is what hands that copy to the loader, and it is a separate chunk
 * (it holds the whole editor), so it is fetched here, on first use, and always
 * before the loader is asked for Monaco: asked first, the loader would go and
 * download its own copy from a CDN.
 */
export function useBundledMonaco(): Monaco | null {
    const [monaco, setMonaco] = useState<Monaco | null>(null);

    useEffect(() => {
        let cancelled = false;
        void import('./config')
            .then(() => loader.init())
            .then((instance) => {
                if (!cancelled) setMonaco(instance);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    return monaco;
}
