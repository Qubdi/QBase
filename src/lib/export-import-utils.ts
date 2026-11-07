import { exportFileText } from '@/core/wire/file-export';
import { diagramToDesign } from '@/qbase/diagram-convert';
import type { Diagram } from '@/qbase/diagram-types';

/**
 * The text of a diagram file for a diagram in the saved shape: what the JSON
 * export writes, version key and running ids included. QBase code keeps
 * diagrams in that shape; the editor's own export goes through core/wire.
 */
export function diagramToJSONOutput(diagram: Diagram): string {
    return exportFileText(diagramToDesign(diagram).design);
}

/** Reads a chosen file as text; works for any `Blob`, also where `Blob.text` is missing. */
export function readFileText(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsText(file);
    });
}
