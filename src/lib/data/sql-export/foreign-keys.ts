import type { DBField } from '@/lib/domain/db-field';
import {
    normalizeCardinalities,
    type DBRelationship,
} from '@/lib/domain/db-relationship';
import type { DBTable } from '@/lib/domain/db-table';

export interface ForeignKey {
    /** the relationship's name; empty when a composite key's parts had different names */
    name: string;
    /** the table that holds the key */
    fkTable: DBTable;
    fkFields: DBField[];
    /** the table it points at */
    refTable: DBTable;
    refFields: DBField[];
    /** why a database would refuse it (only set when references are verified) */
    problem?: string;
}

const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));

/** Whether the fields identify a row of the table by themselves. */
const identifiesRow = (table: DBTable, fields: DBField[]): boolean => {
    const ids = fields.map((f) => f.id);
    const pk = table.fields.filter((f) => f.primaryKey).map((f) => f.id);
    if (pk.length > 0 && sameSet(ids, pk)) return true;
    if (fields.length === 1 && fields[0].unique) return true;
    return table.indexes.some(
        (ix) => ix.unique && ix.fieldIds.length > 0 && sameSet(ix.fieldIds, ids)
    );
};

interface One {
    name: string;
    fkTable: DBTable;
    fkField: DBField;
    refTable: DBTable;
    refField: DBField;
}

/**
 * The foreign keys of a diagram, one per constraint.
 *
 * A foreign key to a composite key reaches the diagram as one relationship
 * per column. A database refuses a key on part of a composite key, so those
 * relationships are put back together into the single constraint they were.
 * Everything else comes out one for one, in the order given.
 *
 * `verifyReferences` also checks that the referenced columns identify a row,
 * which a database insists on, and says so in `problem` when they do not.
 */
export function collectForeignKeys({
    tables,
    relationships,
    verifyReferences = false,
}: {
    tables: DBTable[];
    relationships: DBRelationship[] | null | undefined;
    verifyReferences?: boolean;
}): ForeignKey[] {
    const byId = new Map(tables.filter((t) => !t.isView).map((t) => [t.id, t]));

    const ones: One[] = [];
    for (const raw of relationships ?? []) {
        const r = normalizeCardinalities(raw);
        const source = byId.get(r.sourceTableId);
        const target = byId.get(r.targetTableId);
        const sourceField = source?.fields.find(
            (f) => f.id === r.sourceFieldId
        );
        const targetField = target?.fields.find(
            (f) => f.id === r.targetFieldId
        );
        if (!source || !target || !sourceField || !targetField) continue;
        // the many side holds the key; with equal sides, the target does
        const keyOnSource =
            r.sourceCardinality === 'many' && r.targetCardinality === 'one';
        ones.push(
            keyOnSource
                ? {
                      name: r.name,
                      fkTable: source,
                      fkField: sourceField,
                      refTable: target,
                      refField: targetField,
                  }
                : {
                      name: r.name,
                      fkTable: target,
                      fkField: targetField,
                      refTable: source,
                      refField: sourceField,
                  }
        );
    }

    // the relationships that together make one composite key, by first member
    const groups = new Map<string, number[]>();
    ones.forEach((one, i) => {
        const key = `${one.fkTable.id}>${one.refTable.id}`;
        groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    const composite = new Map<number, number[]>();
    const merged = new Set<number>();
    for (const members of groups.values()) {
        const { refTable } = ones[members[0]];
        const pk = refTable.fields.filter((f) => f.primaryKey);
        const refIds = members.map((i) => ones[i].refField.id);
        if (
            pk.length > 1 &&
            members.length === pk.length &&
            sameSet(
                refIds,
                pk.map((f) => f.id)
            )
        ) {
            // in the order of the primary key
            const ordered = pk.map(
                (p) => members.find((i) => ones[i].refField.id === p.id)!
            );
            composite.set(Math.min(...members), ordered);
            members.forEach((i) => merged.add(i));
        }
    }

    const keys: ForeignKey[] = [];
    ones.forEach((one, i) => {
        const parts = composite.get(i);
        if (parts) {
            const names = new Set(parts.map((p) => ones[p].name));
            keys.push({
                name: names.size === 1 ? one.name : '',
                fkTable: one.fkTable,
                fkFields: parts.map((p) => ones[p].fkField),
                refTable: one.refTable,
                refFields: parts.map((p) => ones[p].refField),
            });
        } else if (!merged.has(i)) {
            keys.push({
                name: one.name,
                fkTable: one.fkTable,
                fkFields: [one.fkField],
                refTable: one.refTable,
                refFields: [one.refField],
            });
        }
    });

    if (verifyReferences) {
        for (const k of keys) {
            if (identifiesRow(k.refTable, k.refFields)) continue;
            const columns = k.refFields.map((f) => f.name).join(', ');
            const inComposite =
                k.refFields.length === 1 &&
                k.refTable.fields.filter((f) => f.primaryKey).length > 1;
            k.problem = inComposite
                ? `${k.refTable.name}.${columns} is only part of a composite key, and no database accepts a foreign key to part of a key`
                : `${k.refTable.name}.${columns} is not unique, and no database accepts a foreign key to a column that is not`;
        }
    }
    return keys;
}
