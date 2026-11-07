import React, { useCallback, useContext, useState } from 'react';
import { planAddEntity } from '@/core/commands/plan-entity';
import { traitsOf } from '@/core/model/database';
import type { EntityKind } from '@/core/model/entity';
import { PanelContextValue } from '@/platform/panel/panel-context';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { SelectSchemaDialog } from './schema-dialogs';
import { visibleSchemas } from './table-list';

/** How far from the corner of the visible canvas a new table is put (EDT-074). */
const OFFSET = 80;

/**
 * The Add Table and Add View actions. With several schemas shown, a dialog asks
 * which one the table belongs to (EDT-076); with one it is used without asking.
 * `dialog` must be rendered by the caller.
 */
export function useAddTable(onAdded?: () => void) {
    const { design, filter, showViews, edit } = useEditorEnv();
    const { viewportOrigin } = useContext(PanelContextValue);
    const [asking, setAsking] = useState<EntityKind | undefined>();

    const create = useCallback(
        (kind: EntityKind, schemas: string[], chosen?: string) => {
            const origin = viewportOrigin?.() ?? { x: 0, y: 0 };
            edit(
                planAddEntity(design, {
                    kind,
                    x: origin.x + OFFSET,
                    y: origin.y + OFFSET,
                    visibleSchemas: chosen ? [chosen] : schemas,
                })
            );
            onAdded?.();
        },
        [design, edit, onAdded, viewportOrigin]
    );

    const schemas = visibleSchemas(design, filter, showViews);
    const add = (kind: EntityKind) => {
        if (schemas.length > 1) setAsking(kind);
        else create(kind, schemas);
    };

    const defaultSchema = traitsOf(design.databaseType).defaultSchema;
    const dialog = asking ? (
        <SelectSchemaDialog
            schemas={schemas}
            defaultSchema={
                defaultSchema && schemas.includes(defaultSchema)
                    ? defaultSchema
                    : schemas[0]
            }
            onCancel={() => setAsking(undefined)}
            onConfirm={(schema) => {
                create(asking, schemas, schema);
                setAsking(undefined);
            }}
        />
    ) : null;

    return { add, dialog };
}
