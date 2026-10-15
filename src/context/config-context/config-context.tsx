import { createContext } from 'react';
import { emptyFn } from '@/lib/utils';
import type { DiagramConfig } from '@/lib/domain/config';

export interface ConfigContext {
    config?: DiagramConfig;
    updateConfig: (params: {
        config?: Partial<DiagramConfig>;
        updateFn?: (config: DiagramConfig) => DiagramConfig;
    }) => Promise<void>;
}

export const ConfigContext = createContext<ConfigContext>({
    config: undefined,
    updateConfig: emptyFn,
});
