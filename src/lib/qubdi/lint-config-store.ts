import { normalizeConfig, type LintConfig } from '../../../shared/lint';
import { readJsonMap } from './local-map';

// Lint settings live in the browser per diagram, so linting works offline.
// When the diagram is on a server they are also pushed there, so the API and
// the CLI use the same rules.
const KEY = 'qbase.lint-config';

type All = Record<string, unknown>;

const readAll = (): All => readJsonMap<unknown>(KEY);

export const getLintConfig = (diagramId: string): LintConfig =>
    normalizeConfig(readAll()[diagramId]);

export const setLintConfig = (diagramId: string, config: LintConfig) => {
    try {
        localStorage.setItem(
            KEY,
            JSON.stringify({
                ...readAll(),
                [diagramId]: normalizeConfig(config),
            })
        );
    } catch {
        // storage unavailable: the settings just will not be remembered
    }
};

export const hasLintConfig = (diagramId: string): boolean =>
    diagramId in readAll();
