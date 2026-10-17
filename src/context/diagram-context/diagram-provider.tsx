import React, { useCallback, useMemo, useState } from 'react';
import type { DBTable } from '@/lib/domain/db-table';
import { deepCopy, generateId } from '@/lib/utils';
import { defaultTableColor, randomColor, viewColor } from '@/lib/colors';
import type { DiagramContext, DiagramEvent } from './diagram-context';
import { diagramContext } from './diagram-context';
import { DatabaseType } from '@/lib/domain/database-type';
import type { DBField } from '@/lib/domain/db-field';
import {
    getTableIndexesWithPrimaryKey,
    type DBIndex,
} from '@/lib/domain/db-index';
import type { DBCheckConstraint } from '@/lib/domain/db-check-constraint';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import { useStorage } from '@/hooks/use-storage';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import type { Diagram } from '@/lib/domain/diagram';
import type { DatabaseEdition } from '@/lib/domain/database-edition';
import type { DBSchema } from '@/lib/domain/db-schema';
import {
    databasesWithSchemas,
    schemaNameToSchemaId,
} from '@/lib/domain/db-schema';
import { defaultSchemas } from '@/lib/data/default-schemas';
import { useEventEmitter } from 'ahooks';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { Note } from '@/lib/domain/note';
import { storageInitialValue } from '../storage-context/storage-context';
import { useDiff } from '../diff-context/use-diff';
import type { DiffCalculatedEvent } from '../diff-context/diff-context';
import {
    DBCustomTypeKind,
    type DBCustomType,
} from '@/lib/domain/db-custom-type';
import { getDefaultPrimaryKeyType } from '@/lib/data/data-types/data-types';

export interface DiagramProviderProps {
    diagram?: Diagram;
    readonly?: boolean;
}

export const DiagramProvider: React.FC<
    React.PropsWithChildren<DiagramProviderProps>
> = ({ children, diagram, readonly: readonlyProp }) => {
    const { hasDiff } = useDiff();
    const storageDB = useStorage();
    const events = useEventEmitter<DiagramEvent>();
    const { addUndoAction, resetRedoStack, resetUndoStack } =
        useRedoUndoStack();

    const [diagramId, setDiagramId] = useState('');
    const [diagramName, setDiagramName] = useState('');
    const [diagramCreatedAt, setDiagramCreatedAt] = useState<Date>(new Date());
    const [diagramUpdatedAt, setDiagramUpdatedAt] = useState<Date>(new Date());
    const [databaseType, setDatabaseType] = useState<DatabaseType>(
        DatabaseType.GENERIC
    );
    const [databaseEdition, setDatabaseEdition] = useState<
        DatabaseEdition | undefined
    >();
    const [tables, setTables] = useState<DBTable[]>(diagram?.tables ?? []);
    const [relationships, setRelationships] = useState<DBRelationship[]>(
        diagram?.relationships ?? []
    );
    const [dependencies, setDependencies] = useState<DBDependency[]>(
        diagram?.dependencies ?? []
    );
    const [areas, setAreas] = useState<Area[]>(diagram?.areas ?? []);
    const [customTypes, setCustomTypes] = useState<DBCustomType[]>(
        diagram?.customTypes ?? []
    );
    const [notes, setNotes] = useState<Note[]>(diagram?.notes ?? []);

    const { events: diffEvents } = useDiff();

    const [highlightedCustomTypeId, setHighlightedCustomTypeId] =
        useState<string>();

    const diffCalculatedHandler = useCallback((event: DiffCalculatedEvent) => {
        const { tablesToAdd, fieldsToAdd, relationshipsToAdd, areasToAdd } =
            event.data;
        setTables((tables) =>
            [...tables, ...(tablesToAdd ?? [])].map((table) => {
                const fields = fieldsToAdd.get(table.id);
                return fields
                    ? { ...table, fields: [...table.fields, ...fields] }
                    : table;
            })
        );
        setRelationships((relationships) => [
            ...relationships,
            ...(relationshipsToAdd ?? []),
        ]);
        setAreas((areas) => [...areas, ...(areasToAdd ?? [])]);
    }, []);

    diffEvents.useSubscription(diffCalculatedHandler);

    const defaultSchemaName = useMemo(
        () => defaultSchemas[databaseType],
        [databaseType]
    );

    const readonly = useMemo(
        () => readonlyProp ?? hasDiff ?? false,
        [readonlyProp, hasDiff]
    );

    const schemas = useMemo(
        () =>
            databasesWithSchemas.includes(databaseType)
                ? [
                      ...new Set(
                          tables
                              .map((table) => table.schema)
                              .filter((schema) => !!schema) as string[]
                      ),
                  ]
                      .sort((a, b) => {
                          if (a === defaultSchemaName) return -1;
                          if (b === defaultSchemaName) return 1;
                          return a.localeCompare(b);
                      })
                      .map((schema): DBSchema => ({
                          id: schemaNameToSchemaId(schema),
                          name: schema,
                          tableCount: tables.filter(
                              (table) => table.schema === schema
                          ).length,
                      }))
                : [],
        [tables, defaultSchemaName, databaseType]
    );

    const db = useMemo(
        () => (readonly ? storageInitialValue : storageDB),
        [storageDB, readonly]
    );

    const currentDiagram: Diagram = useMemo(
        () => ({
            id: diagramId,
            name: diagramName,
            createdAt: diagramCreatedAt,
            updatedAt: diagramUpdatedAt,
            databaseType,
            databaseEdition,
            tables,
            relationships,
            dependencies,
            areas,
            customTypes,
            notes,
        }),
        [
            diagramId,
            diagramName,
            databaseType,
            databaseEdition,
            tables,
            relationships,
            dependencies,
            areas,
            customTypes,
            notes,
            diagramCreatedAt,
            diagramUpdatedAt,
        ]
    );

    const clearDiagramData: DiagramContext['clearDiagramData'] =
        useCallback(async () => {
            const updatedAt = new Date();
            setTables([]);
            setRelationships([]);
            setDependencies([]);
            setAreas([]);
            setCustomTypes([]);
            setNotes([]);
            setDiagramUpdatedAt(updatedAt);

            resetRedoStack();
            resetUndoStack();

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.deleteDiagramTables(diagramId),
                db.deleteDiagramRelationships(diagramId),
                db.deleteDiagramDependencies(diagramId),
                db.deleteDiagramAreas(diagramId),
                db.deleteDiagramCustomTypes(diagramId),
                db.deleteDiagramNotes(diagramId),
            ]);
        }, [db, diagramId, resetRedoStack, resetUndoStack]);

    const deleteDiagram: DiagramContext['deleteDiagram'] =
        useCallback(async () => {
            setDiagramId('');
            setDiagramName('');
            setDatabaseType(DatabaseType.GENERIC);
            setDatabaseEdition(undefined);
            setTables([]);
            setRelationships([]);
            setDependencies([]);
            setAreas([]);
            setCustomTypes([]);
            setNotes([]);
            resetRedoStack();
            resetUndoStack();

            await Promise.all([
                db.deleteDiagramTables(diagramId),
                db.deleteDiagramRelationships(diagramId),
                db.deleteDiagram(diagramId),
                db.deleteDiagramDependencies(diagramId),
                db.deleteDiagramAreas(diagramId),
                db.deleteDiagramCustomTypes(diagramId),
                db.deleteDiagramNotes(diagramId),
            ]);
        }, [db, diagramId, resetRedoStack, resetUndoStack]);

    const updateDiagramUpdatedAt: DiagramContext['updateDiagramUpdatedAt'] =
        useCallback(async () => {
            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await db.updateDiagram({
                id: diagramId,
                attributes: { updatedAt },
            });
        }, [db, diagramId, setDiagramUpdatedAt]);

    const updateDatabaseType: DiagramContext['updateDatabaseType'] =
        useCallback(
            async (databaseType) => {
                setDatabaseType(databaseType);
                await db.updateDiagram({
                    id: diagramId,
                    attributes: {
                        databaseType,
                    },
                });
            },
            [db, diagramId, setDatabaseType]
        );

    const updateDatabaseEdition: DiagramContext['updateDatabaseEdition'] =
        useCallback(
            async (databaseEdition) => {
                setDatabaseEdition(databaseEdition);
                await db.updateDiagram({
                    id: diagramId,
                    attributes: {
                        databaseEdition,
                    },
                });
            },
            [db, diagramId, setDatabaseEdition]
        );

    const updateDiagramId: DiagramContext['updateDiagramId'] = useCallback(
        async (id) => {
            const prevId = diagramId;
            setDiagramId(id);
            await db.updateDiagram({ id: prevId, attributes: { id } });
        },
        [db, diagramId, setDiagramId]
    );

    const updateDiagramName: DiagramContext['updateDiagramName'] = useCallback(
        async (name, options = { updateHistory: true }) => {
            const prevName = diagramName;
            setDiagramName(name);
            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await db.updateDiagram({
                id: diagramId,
                attributes: { name, updatedAt },
            });

            if (options.updateHistory) {
                addUndoAction({
                    action: 'updateDiagramName',
                    redoData: { name },
                    undoData: { name: prevName },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            setDiagramName,
            addUndoAction,
            diagramName,
            resetRedoStack,
        ]
    );

    const addTables: DiagramContext['addTables'] = useCallback(
        async (tablesToAdd: DBTable[], options = { updateHistory: true }) => {
            setTables((currentTables) => [...currentTables, ...tablesToAdd]);
            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                ...tablesToAdd.map((table) =>
                    db.addTable({ diagramId, table })
                ),
            ]);

            events.emit({
                action: 'add_tables',
                data: { tables: tablesToAdd },
            });

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addTables',
                    redoData: { tables: tablesToAdd },
                    undoData: { tableIds: tablesToAdd.map((t) => t.id) },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setTables, addUndoAction, resetRedoStack, events]
    );

    const addTable: DiagramContext['addTable'] = useCallback(
        async (table: DBTable, options = { updateHistory: true }) => {
            return addTables([table], options);
        },
        [addTables]
    );

    const createTable: DiagramContext['createTable'] = useCallback(
        async (attributes) => {
            const isView = attributes?.isView ?? false;
            const count = isView
                ? tables.filter((t) => t.isView).length + 1
                : tables.filter((t) => !t.isView).length + 1;
            const table: DBTable = {
                id: generateId(),
                name: isView ? `view_${count}` : `table_${count}`,
                x: 0,
                y: 0,
                fields: [
                    {
                        id: generateId(),
                        name: 'id',
                        type: getDefaultPrimaryKeyType(databaseType),
                        unique: true,
                        nullable: false,
                        primaryKey: true,
                        createdAt: Date.now(),
                    },
                ],
                indexes: [],
                color: attributes?.isView ? viewColor : defaultTableColor,
                createdAt: Date.now(),
                isView: false,
                order: tables.length,
                ...attributes,
                schema: attributes?.schema ?? defaultSchemas[databaseType],
            };

            table.indexes = getTableIndexesWithPrimaryKey({
                table,
            });

            await addTable(table);

            return table;
        },
        [addTable, tables, databaseType]
    );

    const getTable: DiagramContext['getTable'] = useCallback(
        (id: string) => tables.find((table) => table.id === id) ?? null,
        [tables]
    );

    const removeTables: DiagramContext['removeTables'] = useCallback(
        async (ids, options) => {
            const tables = ids.map((id) => getTable(id)).filter((t) => !!t);
            const relationshipsToRemove = relationships.filter(
                (relationship) =>
                    ids.includes(relationship.sourceTableId) ||
                    ids.includes(relationship.targetTableId)
            );

            const dependenciesToRemove = dependencies.filter(
                (dependency) =>
                    ids.includes(dependency.tableId) ||
                    ids.includes(dependency.dependentTableId)
            );

            setRelationships((relationships) =>
                relationships.filter(
                    (relationship) =>
                        !relationshipsToRemove.some(
                            (r) => r.id === relationship.id
                        )
                )
            );

            setDependencies((dependencies) =>
                dependencies.filter(
                    (dependency) =>
                        !dependenciesToRemove.some(
                            (d) => d.id === dependency.id
                        )
                )
            );

            setTables((tables) =>
                tables.filter((table) => !ids.includes(table.id))
            );

            events.emit({ action: 'remove_tables', data: { tableIds: ids } });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                ...relationshipsToRemove.map((relationship) =>
                    db.deleteRelationship({ diagramId, id: relationship.id })
                ),
                ...dependenciesToRemove.map((dependency) =>
                    db.deleteDependency({ diagramId, id: dependency.id })
                ),
                ...ids.map((id) => db.deleteTable({ diagramId, id })),
            ]);

            if (tables.length > 0 && options?.updateHistory) {
                addUndoAction({
                    action: 'removeTables',
                    redoData: {
                        tableIds: ids,
                    },
                    undoData: {
                        tables,
                        relationships: relationshipsToRemove,
                        dependencies: dependenciesToRemove,
                    },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            setTables,
            addUndoAction,
            resetRedoStack,
            getTable,
            relationships,
            events,
            dependencies,
        ]
    );

    const removeTable: DiagramContext['removeTable'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeTables([id], options);
        },
        [removeTables]
    );

    const updateTable: DiagramContext['updateTable'] = useCallback(
        async (
            id: string,
            table: Partial<DBTable>,
            options = { updateHistory: true }
        ) => {
            const prevTable = getTable(id);
            setTables((tables) =>
                tables.map((t) => (t.id === id ? { ...t, ...table } : t))
            );

            events.emit({
                action: 'update_table',
                data: { id, table },
            });

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({ id, attributes: table }),
            ]);

            if (!!prevTable && options.updateHistory) {
                addUndoAction({
                    action: 'updateTable',
                    redoData: { tableId: id, table },
                    undoData: { tableId: id, table: prevTable },
                });
                resetRedoStack();
            }
        },
        [
            db,
            setTables,
            addUndoAction,
            resetRedoStack,
            getTable,
            diagramId,
            events,
        ]
    );

    const updateTablesState: DiagramContext['updateTablesState'] = useCallback(
        async (
            updateFn: (tables: DBTable[]) => PartialExcept<DBTable, 'id'>[],
            options = { updateHistory: true, forceOverride: false }
        ) => {
            const updateTables = (prevTables: DBTable[]) => {
                const updatedTables = updateFn(prevTables);
                if (options.forceOverride) {
                    return updatedTables as DBTable[];
                }

                return prevTables
                    .map((prevTable) => {
                        const updatedTable = updatedTables.find(
                            (t) => t.id === prevTable.id
                        );
                        return updatedTable
                            ? { ...prevTable, ...updatedTable }
                            : prevTable;
                    })
                    .filter((prevTable) =>
                        updatedTables.some((t) => t.id === prevTable.id)
                    );
            };

            const prevTables = deepCopy(tables);
            const updatedTables = updateTables(tables);

            const tablesToDelete = prevTables.filter(
                (table) => !updatedTables.some((t) => t.id === table.id)
            );

            const relationshipsToRemove = relationships.filter((relationship) =>
                tablesToDelete.some(
                    (table) =>
                        table.id === relationship.sourceTableId ||
                        table.id === relationship.targetTableId
                )
            );

            const dependenciesToRemove = dependencies.filter((dependency) =>
                tablesToDelete.some(
                    (table) =>
                        table.id === dependency.tableId ||
                        table.id === dependency.dependentTableId
                )
            );

            setRelationships((relationships) =>
                relationships.filter(
                    (relationship) =>
                        !relationshipsToRemove.some(
                            (r) => r.id === relationship.id
                        )
                )
            );

            setDependencies((dependencies) =>
                dependencies.filter(
                    (dependency) =>
                        !dependenciesToRemove.some(
                            (d) => d.id === dependency.id
                        )
                )
            );

            setTables(updateTables);

            events.emit({
                action: 'remove_tables',
                data: { tableIds: tablesToDelete.map((t) => t.id) },
            });

            const promises = [];
            for (const updatedTable of updatedTables) {
                promises.push(
                    db.putTable({
                        diagramId,
                        table: updatedTable,
                    })
                );
            }

            for (const table of tablesToDelete) {
                promises.push(db.deleteTable({ diagramId, id: table.id }));
            }

            for (const relationship of relationshipsToRemove) {
                promises.push(
                    db.deleteRelationship({ diagramId, id: relationship.id })
                );
            }

            for (const dependency of dependenciesToRemove) {
                promises.push(
                    db.deleteDependency({ diagramId, id: dependency.id })
                );
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            promises.push(
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } })
            );

            await Promise.all(promises);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'updateTablesState',
                    redoData: { tables: updatedTables },
                    undoData: {
                        tables: prevTables,
                        relationships: relationshipsToRemove,
                        dependencies: dependenciesToRemove,
                    },
                });
                resetRedoStack();
            }
        },
        [
            db,
            tables,
            setTables,
            diagramId,
            addUndoAction,
            resetRedoStack,
            relationships,
            events,
            dependencies,
        ]
    );

    const getField: DiagramContext['getField'] = useCallback(
        (tableId: string, fieldId: string) => {
            const table = getTable(tableId);
            return table?.fields.find((f) => f.id === fieldId) ?? null;
        },
        [getTable]
    );

    const updateField: DiagramContext['updateField'] = useCallback(
        async (
            tableId: string,
            fieldId: string,
            field: Partial<DBField>,
            options = { updateHistory: true }
        ) => {
            const prevField = getField(tableId, fieldId);

            const updateTableFn = (table: DBTable) => {
                const updatedTable: DBTable = {
                    ...table,
                    fields: table.fields.map((f) =>
                        f.id === fieldId ? { ...f, ...field } : f
                    ),
                } satisfies DBTable;

                updatedTable.indexes = getTableIndexesWithPrimaryKey({
                    table: updatedTable,
                });

                return updatedTable;
            };

            setTables((tables) =>
                tables.map((table) => {
                    if (table.id === tableId) {
                        return updateTableFn(table);
                    }

                    return table;
                })
            );

            const table = await db.getTable({ diagramId, id: tableId });
            if (!table) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...updateTableFn(table),
                    },
                }),
            ]);

            if (!!prevField && options.updateHistory) {
                addUndoAction({
                    action: 'updateField',
                    redoData: {
                        tableId,
                        fieldId,
                        field: { ...prevField, ...field },
                    },
                    undoData: { tableId, fieldId, field: prevField },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setTables, addUndoAction, resetRedoStack, getField]
    );

    const removeField: DiagramContext['removeField'] = useCallback(
        async (
            tableId: string,
            fieldId: string,
            options = { updateHistory: true }
        ) => {
            const updateTableFn = (table: DBTable) => {
                const updatedTable: DBTable = {
                    ...table,
                    fields: table.fields.filter((f) => f.id !== fieldId),
                } satisfies DBTable;

                updatedTable.indexes = getTableIndexesWithPrimaryKey({
                    table: updatedTable,
                });

                return updatedTable;
            };

            const fields = getTable(tableId)?.fields ?? [];
            const prevField = getField(tableId, fieldId);
            setTables((tables) =>
                tables.map((table) => {
                    if (table.id === tableId) {
                        return updateTableFn(table);
                    }

                    return table;
                })
            );

            events.emit({
                action: 'remove_field',
                data: {
                    tableId: tableId,
                    fieldId,
                    fields: fields.filter((f) => f.id !== fieldId),
                },
            });

            const table = await db.getTable({ diagramId, id: tableId });
            if (!table) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...updateTableFn(table),
                    },
                }),
            ]);

            if (!!prevField && options.updateHistory) {
                addUndoAction({
                    action: 'removeField',
                    redoData: { tableId, fieldId },
                    undoData: { tableId, field: prevField },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            setTables,
            addUndoAction,
            resetRedoStack,
            getField,
            getTable,
            events,
        ]
    );

    const addField: DiagramContext['addField'] = useCallback(
        async (
            tableId: string,
            field: DBField,
            options = { updateHistory: true }
        ) => {
            const fields = getTable(tableId)?.fields ?? [];
            setTables((tables) => {
                return tables.map((table) => {
                    if (table.id === tableId) {
                        db.updateTable({
                            id: tableId,
                            attributes: {
                                ...table,
                                fields: [...table.fields, field],
                            },
                        });

                        return { ...table, fields: [...table.fields, field] };
                    }

                    return table;
                });
            });

            events.emit({
                action: 'add_field',
                data: {
                    tableId: tableId,
                    field,
                    fields: [...fields, field],
                },
            });

            const table = await db.getTable({ diagramId, id: tableId });

            if (!table) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addField',
                    redoData: { tableId, field },
                    undoData: { tableId, fieldId: field.id },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            setTables,
            addUndoAction,
            resetRedoStack,
            events,
            getTable,
        ]
    );

    const createField: DiagramContext['createField'] = useCallback(
        async (tableId: string) => {
            const table = getTable(tableId);
            const field: DBField = {
                id: generateId(),
                name: `field_${(table?.fields?.length ?? 0) + 1}`,
                type: getDefaultPrimaryKeyType(databaseType),
                unique: false,
                nullable: true,
                primaryKey: false,
                createdAt: Date.now(),
            };

            await addField(tableId, field);

            return field;
        },
        [addField, getTable, databaseType]
    );

    const getIndex: DiagramContext['getIndex'] = useCallback(
        (tableId: string, indexId: string) => {
            const table = getTable(tableId);
            return table?.indexes.find((i) => i.id === indexId) ?? null;
        },
        [getTable]
    );

    const addIndex: DiagramContext['addIndex'] = useCallback(
        async (
            tableId: string,
            index: DBIndex,
            options = { updateHistory: true }
        ) => {
            setTables((tables) =>
                tables.map((table) =>
                    table.id === tableId
                        ? { ...table, indexes: [...table.indexes, index] }
                        : table
                )
            );

            const dbTable = await db.getTable({ diagramId, id: tableId });
            if (!dbTable) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...dbTable,
                        indexes: [...dbTable.indexes, index],
                    },
                }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addIndex',
                    redoData: { tableId, index },
                    undoData: { tableId, indexId: index.id },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setTables, addUndoAction, resetRedoStack]
    );

    const removeIndex: DiagramContext['removeIndex'] = useCallback(
        async (
            tableId: string,
            indexId: string,
            options = { updateHistory: true }
        ) => {
            const prevIndex = getIndex(tableId, indexId);
            setTables((tables) =>
                tables.map((table) =>
                    table.id === tableId
                        ? {
                              ...table,
                              indexes: table.indexes.filter(
                                  (i) => i.id !== indexId
                              ),
                          }
                        : table
                )
            );

            const dbTable = await db.getTable({
                diagramId,
                id: tableId,
            });

            if (!dbTable) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...dbTable,
                        indexes: dbTable.indexes.filter(
                            (i) => i.id !== indexId
                        ),
                    },
                }),
            ]);

            if (!!prevIndex && options.updateHistory) {
                addUndoAction({
                    action: 'removeIndex',
                    redoData: { indexId, tableId },
                    undoData: { tableId, index: prevIndex },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setTables, addUndoAction, resetRedoStack, getIndex]
    );

    const createIndex: DiagramContext['createIndex'] = useCallback(
        async (tableId: string) => {
            const table = getTable(tableId);
            const index: DBIndex = {
                id: generateId(),
                name: `index_${(table?.indexes?.length ?? 0) + 1}`,
                fieldIds: [],
                unique: false,
                createdAt: Date.now(),
            };

            await addIndex(tableId, index);

            return index;
        },
        [addIndex, getTable]
    );

    const updateIndex: DiagramContext['updateIndex'] = useCallback(
        async (
            tableId: string,
            indexId: string,
            index: Partial<DBIndex>,
            options = { updateHistory: true }
        ) => {
            const prevIndex = getIndex(tableId, indexId);
            setTables((tables) =>
                tables.map((table) =>
                    table.id === tableId
                        ? {
                              ...table,
                              indexes: table.indexes.map((i) =>
                                  i.id === indexId ? { ...i, ...index } : i
                              ),
                          }
                        : table
                )
            );

            const dbTable = await db.getTable({ diagramId, id: tableId });

            if (!dbTable) {
                return;
            }

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateTable({
                    id: tableId,
                    attributes: {
                        ...dbTable,
                        indexes: dbTable.indexes.map((i) =>
                            i.id === indexId ? { ...i, ...index } : i
                        ),
                    },
                }),
            ]);

            if (!!prevIndex && options.updateHistory) {
                addUndoAction({
                    action: 'updateIndex',
                    redoData: { tableId, indexId, index },
                    undoData: { tableId, indexId, index: prevIndex },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setTables, addUndoAction, resetRedoStack, getIndex]
    );

    const addCheckConstraint: DiagramContext['addCheckConstraint'] =
        useCallback(
            async (
                tableId: string,
                constraint: DBCheckConstraint,
                options = { updateHistory: true }
            ) => {
                setTables((tables) =>
                    tables.map((t) =>
                        t.id === tableId
                            ? {
                                  ...t,
                                  checkConstraints: [
                                      ...(t.checkConstraints ?? []),
                                      constraint,
                                  ],
                              }
                            : t
                    )
                );

                const dbTable = await db.getTable({ diagramId, id: tableId });
                if (!dbTable) {
                    return;
                }

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                    db.updateTable({
                        id: tableId,
                        attributes: {
                            ...dbTable,
                            checkConstraints: [
                                ...(dbTable.checkConstraints ?? []),
                                constraint,
                            ],
                        },
                    }),
                ]);

                if (options.updateHistory) {
                    addUndoAction({
                        action: 'addCheckConstraint',
                        redoData: { tableId, constraint },
                        undoData: { tableId, constraintId: constraint.id },
                    });
                    resetRedoStack();
                }
            },
            [db, diagramId, setTables, addUndoAction, resetRedoStack]
        );

    const createCheckConstraint: DiagramContext['createCheckConstraint'] =
        useCallback(
            async (tableId: string) => {
                const constraint: DBCheckConstraint = {
                    id: generateId(),
                    expression: '',
                    createdAt: Date.now(),
                };

                await addCheckConstraint(tableId, constraint);

                return constraint;
            },
            [addCheckConstraint]
        );

    const removeCheckConstraint: DiagramContext['removeCheckConstraint'] =
        useCallback(
            async (
                tableId: string,
                constraintId: string,
                options = { updateHistory: true }
            ) => {
                const table = getTable(tableId);
                const prevConstraint = table?.checkConstraints?.find(
                    (c) => c.id === constraintId
                );

                setTables((tables) =>
                    tables.map((t) =>
                        t.id === tableId
                            ? {
                                  ...t,
                                  checkConstraints: (
                                      t.checkConstraints ?? []
                                  ).filter((c) => c.id !== constraintId),
                              }
                            : t
                    )
                );

                const dbTable = await db.getTable({ diagramId, id: tableId });
                if (!dbTable) {
                    return;
                }

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                    db.updateTable({
                        id: tableId,
                        attributes: {
                            ...dbTable,
                            checkConstraints: (
                                dbTable.checkConstraints ?? []
                            ).filter((c) => c.id !== constraintId),
                        },
                    }),
                ]);

                if (!!prevConstraint && options.updateHistory) {
                    addUndoAction({
                        action: 'removeCheckConstraint',
                        redoData: { tableId, constraintId },
                        undoData: { tableId, constraint: prevConstraint },
                    });
                    resetRedoStack();
                }
            },
            [db, diagramId, setTables, addUndoAction, resetRedoStack, getTable]
        );

    const updateCheckConstraint: DiagramContext['updateCheckConstraint'] =
        useCallback(
            async (
                tableId: string,
                constraintId: string,
                constraint: Partial<DBCheckConstraint>,
                options = { updateHistory: true }
            ) => {
                const table = getTable(tableId);
                const prevConstraint = table?.checkConstraints?.find(
                    (c) => c.id === constraintId
                );

                setTables((tables) =>
                    tables.map((t) =>
                        t.id === tableId
                            ? {
                                  ...t,
                                  checkConstraints: (
                                      t.checkConstraints ?? []
                                  ).map((c) =>
                                      c.id === constraintId
                                          ? { ...c, ...constraint }
                                          : c
                                  ),
                              }
                            : t
                    )
                );

                const dbTable = await db.getTable({ diagramId, id: tableId });
                if (!dbTable) {
                    return;
                }

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                    db.updateTable({
                        id: tableId,
                        attributes: {
                            ...dbTable,
                            checkConstraints: (
                                dbTable.checkConstraints ?? []
                            ).map((c) =>
                                c.id === constraintId
                                    ? { ...c, ...constraint }
                                    : c
                            ),
                        },
                    }),
                ]);

                if (!!prevConstraint && options.updateHistory) {
                    addUndoAction({
                        action: 'updateCheckConstraint',
                        redoData: { tableId, constraintId, constraint },
                        undoData: {
                            tableId,
                            constraintId,
                            constraint: prevConstraint,
                        },
                    });
                    resetRedoStack();
                }
            },
            [db, diagramId, setTables, addUndoAction, resetRedoStack, getTable]
        );

    const addRelationships: DiagramContext['addRelationships'] = useCallback(
        async (
            relationships: DBRelationship[],
            options = { updateHistory: true }
        ) => {
            setRelationships((currentRelationships) => [
                ...currentRelationships,
                ...relationships,
            ]);

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...relationships.map((relationship) =>
                    db.addRelationship({ diagramId, relationship })
                ),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addRelationships',
                    redoData: { relationships },
                    undoData: {
                        relationshipIds: relationships.map((r) => r.id),
                    },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setRelationships, addUndoAction, resetRedoStack]
    );

    const addRelationship: DiagramContext['addRelationship'] = useCallback(
        async (
            relationship: DBRelationship,
            options = { updateHistory: true }
        ) => {
            return addRelationships([relationship], options);
        },
        [addRelationships]
    );

    const createRelationship: DiagramContext['createRelationship'] =
        useCallback(
            async ({
                sourceTableId,
                targetTableId,
                sourceFieldId,
                targetFieldId,
            }) => {
                const sourceTable = getTable(sourceTableId);
                const sourceTableName = sourceTable?.name ?? '';

                const sourceField = sourceTable?.fields.find(
                    (field: { id: string }) => field.id === sourceFieldId
                );

                const sourceFieldName = sourceField?.name ?? '';

                const targetTable = getTable(targetTableId);
                const targetTableSchema = targetTable?.schema;

                const relationship: DBRelationship = {
                    id: generateId(),
                    name: `${sourceTableName}_${sourceFieldName}_fk`,
                    sourceSchema: sourceTable?.schema,
                    sourceTableId,
                    targetSchema: targetTableSchema,
                    targetTableId,
                    sourceFieldId,
                    targetFieldId,
                    sourceCardinality: 'one',
                    targetCardinality: 'one',
                    createdAt: Date.now(),
                };

                await addRelationship(relationship);

                return relationship;
            },
            [addRelationship, getTable]
        );

    const getRelationship: DiagramContext['getRelationship'] = useCallback(
        (id: string) =>
            relationships.find((relationship) => relationship.id === id) ??
            null,
        [relationships]
    );

    const removeRelationships: DiagramContext['removeRelationships'] =
        useCallback(
            async (ids: string[], options = { updateHistory: true }) => {
                const prevRelationships = [
                    ...relationships.filter((relationship) =>
                        ids.includes(relationship.id)
                    ),
                ];

                setRelationships((relationships) =>
                    relationships.filter(
                        (relationship) => !ids.includes(relationship.id)
                    )
                );

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    ...ids.map((id) =>
                        db.deleteRelationship({ diagramId, id })
                    ),
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                ]);

                if (prevRelationships.length > 0 && options.updateHistory) {
                    addUndoAction({
                        action: 'removeRelationships',
                        redoData: { relationshipsIds: ids },
                        undoData: { relationships: prevRelationships },
                    });
                    resetRedoStack();
                }
            },
            [
                db,
                diagramId,
                setRelationships,
                relationships,
                addUndoAction,
                resetRedoStack,
            ]
        );

    const removeRelationship: DiagramContext['removeRelationship'] =
        useCallback(
            async (id: string, options = { updateHistory: true }) => {
                return removeRelationships([id], options);
            },
            [removeRelationships]
        );

    const updateRelationship: DiagramContext['updateRelationship'] =
        useCallback(
            async (
                id: string,
                relationship: Partial<DBRelationship>,
                options = { updateHistory: true }
            ) => {
                const prevRelationship = getRelationship(id);
                setRelationships((relationships) =>
                    relationships.map((r) =>
                        r.id === id ? { ...r, ...relationship } : r
                    )
                );

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                    db.updateRelationship({ id, attributes: relationship }),
                ]);

                if (!!prevRelationship && options.updateHistory) {
                    addUndoAction({
                        action: 'updateRelationship',
                        redoData: { relationshipId: id, relationship },
                        undoData: {
                            relationshipId: id,
                            relationship: prevRelationship,
                        },
                    });
                    resetRedoStack();
                }
            },
            [
                db,
                setRelationships,
                addUndoAction,
                getRelationship,
                resetRedoStack,
                diagramId,
            ]
        );

    const addDependencies: DiagramContext['addDependencies'] = useCallback(
        async (
            dependencies: DBDependency[],
            options = { updateHistory: true }
        ) => {
            setDependencies((currentDependencies) => [
                ...currentDependencies,
                ...dependencies,
            ]);

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...dependencies.map((dependency) =>
                    db.addDependency({ diagramId, dependency })
                ),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addDependencies',
                    redoData: { dependencies },
                    undoData: {
                        dependenciesIds: dependencies.map((r) => r.id),
                    },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setDependencies, addUndoAction, resetRedoStack]
    );

    const addDependency: DiagramContext['addDependency'] = useCallback(
        async (dependency: DBDependency, options = { updateHistory: true }) => {
            return addDependencies([dependency], options);
        },
        [addDependencies]
    );

    const createDependency: DiagramContext['createDependency'] = useCallback(
        async ({ tableId, dependentTableId }) => {
            const table = getTable(tableId);
            const dependentTable = getTable(dependentTableId);

            const dependency: DBDependency = {
                id: generateId(),
                tableId,
                dependentTableId,
                dependentSchema: dependentTable?.schema,
                schema: table?.schema,
                createdAt: Date.now(),
            };

            await addDependency(dependency);

            return dependency;
        },
        [addDependency, getTable]
    );

    const getDependency: DiagramContext['getDependency'] = useCallback(
        (id: string) =>
            dependencies.find((dependency) => dependency.id === id) ?? null,
        [dependencies]
    );

    const removeDependencies: DiagramContext['removeDependencies'] =
        useCallback(
            async (ids: string[], options = { updateHistory: true }) => {
                const prevDependencies = [
                    ...dependencies.filter((dependency) =>
                        ids.includes(dependency.id)
                    ),
                ];

                setDependencies((dependencies) =>
                    dependencies.filter(
                        (dependency) => !ids.includes(dependency.id)
                    )
                );

                const updatedAt = new Date();
                setDiagramUpdatedAt(updatedAt);
                await Promise.all([
                    ...ids.map((id) => db.deleteDependency({ diagramId, id })),
                    db.updateDiagram({
                        id: diagramId,
                        attributes: { updatedAt },
                    }),
                ]);

                if (prevDependencies.length > 0 && options.updateHistory) {
                    addUndoAction({
                        action: 'removeDependencies',
                        redoData: { dependenciesIds: ids },
                        undoData: { dependencies: prevDependencies },
                    });
                    resetRedoStack();
                }
            },
            [
                db,
                diagramId,
                setDependencies,
                addUndoAction,
                resetRedoStack,
                dependencies,
            ]
        );

    const removeDependency: DiagramContext['removeDependency'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeDependencies([id], options);
        },
        [removeDependencies]
    );

    const updateDependency: DiagramContext['updateDependency'] = useCallback(
        async (
            id: string,
            dependency: Partial<DBDependency>,
            options = { updateHistory: true }
        ) => {
            const prevDependency = getDependency(id);
            setDependencies((dependencies) =>
                dependencies.map((d) =>
                    d.id === id ? { ...d, ...dependency } : d
                )
            );

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);
            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateDependency({ id, attributes: dependency }),
            ]);

            if (!!prevDependency && options.updateHistory) {
                addUndoAction({
                    action: 'updateDependency',
                    redoData: { dependencyId: id, dependency },
                    undoData: { dependencyId: id, dependency: prevDependency },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            setDependencies,
            addUndoAction,
            resetRedoStack,
            getDependency,
        ]
    );

    // Area operations
    const addAreas: DiagramContext['addAreas'] = useCallback(
        async (areas: Area[], options = { updateHistory: true }) => {
            setAreas((currentAreas) => [...currentAreas, ...areas]);

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...areas.map((area) => db.addArea({ diagramId, area })),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addAreas',
                    redoData: { areas },
                    undoData: { areaIds: areas.map((a) => a.id) },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setAreas, addUndoAction, resetRedoStack]
    );

    const addArea: DiagramContext['addArea'] = useCallback(
        async (area: Area, options = { updateHistory: true }) => {
            return addAreas([area], options);
        },
        [addAreas]
    );

    const createArea: DiagramContext['createArea'] = useCallback(
        async (attributes) => {
            const area: Area = {
                id: generateId(),
                name: `Area ${areas.length + 1}`,
                x: 0,
                y: 0,
                width: 300,
                height: 200,
                color: randomColor(),
                ...attributes,
            };

            await addArea(area);

            return area;
        },
        [areas, addArea]
    );

    const getArea: DiagramContext['getArea'] = useCallback(
        (id: string) => areas.find((area) => area.id === id) ?? null,
        [areas]
    );

    const removeAreas: DiagramContext['removeAreas'] = useCallback(
        async (ids: string[], options = { updateHistory: true }) => {
            const prevAreas = [
                ...areas.filter((area) => ids.includes(area.id)),
            ];

            setAreas((areas) => areas.filter((area) => !ids.includes(area.id)));

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...ids.map((id) => db.deleteArea({ diagramId, id })),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (prevAreas.length > 0 && options.updateHistory) {
                addUndoAction({
                    action: 'removeAreas',
                    redoData: { areaIds: ids },
                    undoData: { areas: prevAreas },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setAreas, areas, addUndoAction, resetRedoStack]
    );

    const removeArea: DiagramContext['removeArea'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeAreas([id], options);
        },
        [removeAreas]
    );

    const updateArea: DiagramContext['updateArea'] = useCallback(
        async (
            id: string,
            area: Partial<Area>,
            options = { updateHistory: true }
        ) => {
            const prevArea = getArea(id);

            setAreas((areas) =>
                areas.map((a) => (a.id === id ? { ...a, ...area } : a))
            );

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateArea({ id, attributes: area }),
            ]);

            if (!!prevArea && options.updateHistory) {
                addUndoAction({
                    action: 'updateArea',
                    redoData: { areaId: id, area },
                    undoData: { areaId: id, area: prevArea },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setAreas, getArea, addUndoAction, resetRedoStack]
    );

    // Note operations
    const addNotes: DiagramContext['addNotes'] = useCallback(
        async (notes: Note[], options = { updateHistory: true }) => {
            setNotes((currentNotes) => [...currentNotes, ...notes]);

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...notes.map((note) => db.addNote({ diagramId, note })),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addNotes',
                    redoData: { notes },
                    undoData: { noteIds: notes.map((n) => n.id) },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setNotes, addUndoAction, resetRedoStack]
    );

    const addNote: DiagramContext['addNote'] = useCallback(
        async (note: Note, options = { updateHistory: true }) => {
            return addNotes([note], options);
        },
        [addNotes]
    );

    const createNote: DiagramContext['createNote'] = useCallback(
        async (attributes) => {
            const note: Note = {
                id: generateId(),
                content: '',
                x: 0,
                y: 0,
                width: 200,
                height: 150,
                color: '#ffe374', // Default warm yellow
                ...attributes,
            };

            await addNote(note);

            return note;
        },
        [addNote]
    );

    const getNote: DiagramContext['getNote'] = useCallback(
        (id: string) => notes.find((note) => note.id === id) ?? null,
        [notes]
    );

    const removeNotes: DiagramContext['removeNotes'] = useCallback(
        async (ids: string[], options = { updateHistory: true }) => {
            const prevNotes = [
                ...notes.filter((note) => ids.includes(note.id)),
            ];

            setNotes((notes) => notes.filter((note) => !ids.includes(note.id)));

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                ...ids.map((id) => db.deleteNote({ diagramId, id })),
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
            ]);

            if (prevNotes.length > 0 && options.updateHistory) {
                addUndoAction({
                    action: 'removeNotes',
                    redoData: { noteIds: ids },
                    undoData: { notes: prevNotes },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setNotes, notes, addUndoAction, resetRedoStack]
    );

    const removeNote: DiagramContext['removeNote'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeNotes([id], options);
        },
        [removeNotes]
    );

    const updateNote: DiagramContext['updateNote'] = useCallback(
        async (
            id: string,
            note: Partial<Note>,
            options = { updateHistory: true }
        ) => {
            const prevNote = getNote(id);

            setNotes((notes) =>
                notes.map((n) => (n.id === id ? { ...n, ...note } : n))
            );

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateNote({ id, attributes: note }),
            ]);

            if (!!prevNote && options.updateHistory) {
                addUndoAction({
                    action: 'updateNote',
                    redoData: { noteId: id, note },
                    undoData: { noteId: id, note: prevNote },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setNotes, getNote, addUndoAction, resetRedoStack]
    );

    const highlightCustomTypeId = useCallback(
        (id?: string) => setHighlightedCustomTypeId(id),
        [setHighlightedCustomTypeId]
    );

    const highlightedCustomType = useMemo(() => {
        return highlightedCustomTypeId
            ? customTypes.find((type) => type.id === highlightedCustomTypeId)
            : undefined;
    }, [highlightedCustomTypeId, customTypes]);

    const loadDiagramFromData: DiagramContext['loadDiagramFromData'] =
        useCallback(
            (diagram, options) => {
                setDiagramId(diagram.id);
                setDiagramName(diagram.name);
                setDatabaseType(diagram.databaseType);
                setDatabaseEdition(diagram.databaseEdition);
                setTables(diagram.tables ?? []);
                setRelationships(diagram.relationships ?? []);
                setDependencies(diagram.dependencies ?? []);
                setAreas(diagram.areas ?? []);
                setCustomTypes(diagram.customTypes ?? []);
                setDiagramCreatedAt(diagram.createdAt);
                setDiagramUpdatedAt(diagram.updatedAt);
                setHighlightedCustomTypeId(undefined);
                setNotes(diagram.notes ?? []);

                events.emit({ action: 'load_diagram', data: { diagram } });

                // callers that manage history themselves (undo/redo of a whole
                // diagram change) pass resetHistory: false
                if (options?.resetHistory !== false) {
                    resetRedoStack();
                    resetUndoStack();
                }
            },
            [
                setDiagramId,
                setDiagramName,
                setDatabaseType,
                setDatabaseEdition,
                setTables,
                setRelationships,
                setDependencies,
                setAreas,
                setCustomTypes,
                setDiagramCreatedAt,
                setDiagramUpdatedAt,
                setHighlightedCustomTypeId,
                events,
                setNotes,
                resetRedoStack,
                resetUndoStack,
            ]
        );

    const updateDiagramData: DiagramContext['updateDiagramData'] = useCallback(
        async (diagram, options) => {
            const st = options?.forceUpdateStorage ? storageDB : db;
            await st.deleteDiagram(diagram.id);
            await st.addDiagram({ diagram });
            loadDiagramFromData(diagram, {
                resetHistory: options?.resetHistory,
            });
        },
        [db, storageDB, loadDiagramFromData]
    );

    const loadDiagram: DiagramContext['loadDiagram'] = useCallback(
        async (diagramId: string) => {
            const diagram = await storageDB.getDiagram(diagramId, {
                includeRelationships: true,
                includeTables: true,
                includeDependencies: true,
                includeAreas: true,
                includeCustomTypes: true,
                includeNotes: true,
            });

            if (diagram) {
                loadDiagramFromData(diagram);
            }

            return diagram;
        },
        [storageDB, loadDiagramFromData]
    );

    // Custom type operations
    const getCustomType: DiagramContext['getCustomType'] = useCallback(
        (id: string) => customTypes.find((type) => type.id === id) ?? null,
        [customTypes]
    );

    const addCustomTypes: DiagramContext['addCustomTypes'] = useCallback(
        async (
            customTypes: DBCustomType[],
            options = { updateHistory: true }
        ) => {
            setCustomTypes((currentTypes) => [...currentTypes, ...customTypes]);
            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                ...customTypes.map((customType) =>
                    db.addCustomType({ diagramId, customType })
                ),
            ]);

            if (options.updateHistory) {
                addUndoAction({
                    action: 'addCustomTypes',
                    redoData: { customTypes },
                    undoData: { customTypeIds: customTypes.map((t) => t.id) },
                });
                resetRedoStack();
            }
        },
        [db, diagramId, setCustomTypes, addUndoAction, resetRedoStack]
    );

    const addCustomType: DiagramContext['addCustomType'] = useCallback(
        async (customType: DBCustomType, options = { updateHistory: true }) => {
            return addCustomTypes([customType], options);
        },
        [addCustomTypes]
    );

    const createCustomType: DiagramContext['createCustomType'] = useCallback(
        async (attributes) => {
            const customType: DBCustomType = {
                id: generateId(),
                name: `type_${customTypes.length + 1}`,
                kind: DBCustomTypeKind.enum,
                values: [],
                fields: [],
                ...attributes,
            };

            await addCustomType(customType);
            return customType;
        },
        [addCustomType, customTypes]
    );

    const removeCustomTypes: DiagramContext['removeCustomTypes'] = useCallback(
        async (ids, options = { updateHistory: true }) => {
            const typesToRemove = ids
                .map((id) => getCustomType(id))
                .filter(Boolean) as DBCustomType[];

            setCustomTypes((types) =>
                types.filter((type) => !ids.includes(type.id))
            );

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                ...ids.map((id) => db.deleteCustomType({ diagramId, id })),
            ]);

            if (typesToRemove.length > 0 && options.updateHistory) {
                addUndoAction({
                    action: 'removeCustomTypes',
                    redoData: {
                        customTypeIds: ids,
                    },
                    undoData: {
                        customTypes: typesToRemove,
                    },
                });
                resetRedoStack();
            }
        },
        [
            db,
            diagramId,
            setCustomTypes,
            addUndoAction,
            resetRedoStack,
            getCustomType,
        ]
    );

    const removeCustomType: DiagramContext['removeCustomType'] = useCallback(
        async (id: string, options = { updateHistory: true }) => {
            return removeCustomTypes([id], options);
        },
        [removeCustomTypes]
    );

    const updateCustomType: DiagramContext['updateCustomType'] = useCallback(
        async (
            id: string,
            customType: Partial<DBCustomType>,
            options = { updateHistory: true }
        ) => {
            const prevCustomType = getCustomType(id);
            setCustomTypes((types) =>
                types.map((t) => (t.id === id ? { ...t, ...customType } : t))
            );

            const updatedAt = new Date();
            setDiagramUpdatedAt(updatedAt);

            await Promise.all([
                db.updateDiagram({ id: diagramId, attributes: { updatedAt } }),
                db.updateCustomType({ id, attributes: customType }),
            ]);

            if (!!prevCustomType && options.updateHistory) {
                addUndoAction({
                    action: 'updateCustomType',
                    redoData: { customTypeId: id, customType },
                    undoData: { customTypeId: id, customType: prevCustomType },
                });
                resetRedoStack();
            }
        },
        [
            db,
            setCustomTypes,
            addUndoAction,
            resetRedoStack,
            getCustomType,
            diagramId,
        ]
    );

    return (
        <diagramContext.Provider
            value={{
                diagramId,
                diagramName,
                databaseType,
                tables,
                relationships,
                dependencies,
                areas,
                notes,
                currentDiagram,
                schemas,
                events,
                readonly,
                updateDiagramData,
                updateDiagramId,
                updateDiagramName,
                loadDiagram,
                loadDiagramFromData,
                updateDatabaseType,
                updateDatabaseEdition,
                clearDiagramData,
                deleteDiagram,
                updateDiagramUpdatedAt,
                createTable,
                addTable,
                addTables,
                getTable,
                removeTable,
                removeTables,
                updateTable,
                updateTablesState,
                updateField,
                removeField,
                createField,
                addField,
                addIndex,
                createIndex,
                removeIndex,
                getField,
                getIndex,
                updateIndex,
                createCheckConstraint,
                addCheckConstraint,
                removeCheckConstraint,
                updateCheckConstraint,
                addRelationship,
                addRelationships,
                createRelationship,
                getRelationship,
                removeRelationship,
                removeRelationships,
                updateRelationship,
                addDependency,
                addDependencies,
                createDependency,
                getDependency,
                removeDependency,
                removeDependencies,
                updateDependency,
                createArea,
                addArea,
                addAreas,
                getArea,
                removeArea,
                removeAreas,
                updateArea,
                customTypes,
                createCustomType,
                addCustomType,
                addCustomTypes,
                getCustomType,
                removeCustomType,
                removeCustomTypes,
                updateCustomType,
                highlightCustomTypeId,
                highlightedCustomType,
                createNote,
                addNote,
                addNotes,
                getNote,
                removeNote,
                removeNotes,
                updateNote,
            }}
        >
            {children}
        </diagramContext.Provider>
    );
};
