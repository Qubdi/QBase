import { createDesign } from '@/core/model/defaults';
import { i18n } from '@/i18n/i18n';
import { designToDiagram } from '@/qbase/diagram-convert';
import type { DatabaseType, Diagram } from '@/qbase/diagram-types';

/** The name given to a diagram whose maker left the name blank. */
export const defaultDiagramName = (): string =>
    i18n.t('qubdi.workspace.newDiagram.defaultName');

export interface EmptyDiagramArgs {
    id: string;
    name: string;
    databaseType: DatabaseType;
    /** the clock, for tests */
    now?: Date;
}

/** A blank diagram: every collection present and empty, both dates "now". */
export function emptyDiagram({
    id,
    name,
    databaseType,
    now = new Date(),
}: EmptyDiagramArgs): Diagram {
    return designToDiagram(
        createDesign({
            id,
            name,
            defaultName: defaultDiagramName(),
            databaseType,
            now: now.getTime(),
        })
    );
}
