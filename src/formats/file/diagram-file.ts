import type { Design } from '@/core/model/design';
import { exportFileName, exportFileText } from '@/core/wire/file-export';

export interface DiagramFile {
    /** `QBase(<diagram name>).json` */
    fileName: string;
    /** pretty-printed JSON with a version key, running string ids, no local-only data */
    text: string;
}

/** The export file of a design (EXP-058, EXP-059); the work is done by core/wire. */
export function diagramFile(design: Design): DiagramFile {
    return { fileName: exportFileName(design), text: exportFileText(design) };
}
