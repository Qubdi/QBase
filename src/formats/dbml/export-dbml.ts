import { listOf } from '@/core/model/collection';
import type { Column } from '@/core/model/column';
import type { Design } from '@/core/model/design';
import type { Entity } from '@/core/model/entity';
import type { Link } from '@/core/model/link';
import type { Diagnostic } from '@/dialects/script-model';
import {
    dropCast,
    isKeywordDefault,
    isNumberText,
    isQuotedText,
} from '@/dialects/shared/defaults';

export interface DbmlExportOptions {
    /** write each relationship on the field that holds the key */
    inline?: boolean;
}

export interface DbmlExportResult {
    text: string;
    /** warnings such as tables that lost fields (EXP-051) */
    diagnostics: Diagnostic[];
}

const q = (name: string): string =>
    `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const str = (text: string): string =>
    `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')}'`;
const qualified = (schema: string | undefined, name: string): string =>
    schema ? `${q(schema)}.${q(name)}` : q(name);

function typeText(c: Column): string {
    let name = c.type.name;
    if (/\[\]$/.test(name)) name = name.slice(0, -2);
    if (c.length !== undefined) name += `(${c.length})`;
    else if (c.precision !== undefined)
        name +=
            c.scale !== undefined
                ? `(${c.precision},${c.scale})`
                : `(${c.precision})`;
    const array = c.isArray || /\[\]$/.test(c.type.name) ? '[]' : '';
    const bare = /^[\w$]+(?:\([^)]*\))?$/.test(name);
    return (bare ? name : q(name)) + array;
}

/** DBML cannot hold a backtick inside a backtick expression, so they are dropped. */
const withoutBackticks = (text: string): string => text.replace(/`/g, '');

function defaultText(
    raw: string,
    postgres: boolean,
    /** told when the text lost a backtick */
    onStripped?: () => void
): string {
    let text = dropCast(raw.trim());
    const wrapped = /^\(\s*'now'\s*\)$/i.exec(text);
    if (wrapped) text = 'now()';
    if (postgres && /^CURRENT_DATE\(\)$/i.test(text)) text = 'CURRENT_DATE';
    if (isQuotedText(text))
        return str(
            text.replace(/^N?'/i, '').replace(/'$/, '').replace(/''/g, "'")
        );
    if (isNumberText(text) || /^(?:true|false|null)$/i.test(text))
        return text.toLowerCase() === text ? text : text.toLowerCase();
    if (isKeywordDefault(text) && /^CURRENT_/i.test(text)) return `\`${text}\``;
    if (text.includes('`')) onStripped?.();
    return `\`${withoutBackticks(text)}\``;
}

function symbolOf(link: Link): string {
    if (link.sourceCardinality === 'many' && link.targetCardinality === 'one')
        return '>';
    if (link.sourceCardinality === 'one' && link.targetCardinality === 'one')
        return '-';
    return '<';
}

/** DBML for a design, standard or inline references (EXP-050 to EXP-057). */
export function exportDbml(
    design: Design,
    options: DbmlExportOptions = {}
): DbmlExportResult {
    const diagnostics: Diagnostic[] = [];
    const postgres = design.databaseType === 'postgresql';
    const seen = new Set<string>();
    const usable: {
        entity: Entity;
        fields: { column: Column; name: string }[];
    }[] = [];
    for (const entity of listOf(design.entities)) {
        if (entity.kind === 'view') continue;
        const id = `${entity.schema ?? ''}.${entity.name}`;
        if (seen.has(id)) {
            diagnostics.push({
                severity: 'warning',
                message: `Table ${entity.name} was left out: another table has the same name.`,
            });
            continue;
        }
        const own = entity.columnIds
            .map((cid) => design.columns[cid])
            .filter(Boolean);
        const named = own.filter((c) => c.name.trim() !== '');
        if (named.length < own.length)
            diagnostics.push({
                severity: 'warning',
                message: `Table ${entity.name} lost ${own.length - named.length} field(s) without a name.`,
            });
        if (named.length === 0) {
            diagnostics.push({
                severity: 'warning',
                message: `Table ${entity.name} was left out: it has no fields.`,
            });
            continue;
        }
        seen.add(id);
        const used = new Map<string, number>();
        const fields = named.map((column) => {
            let name = column.name;
            if (
                entity.name === 'relation' &&
                (name === 'from' || name === 'to')
            )
                name = `${name}_field`;
            const count = (used.get(name) ?? 0) + 1;
            used.set(name, count);
            return { column, name: count > 1 ? `${name}_${count}` : name };
        });
        usable.push({ entity, fields });
    }
    // maps built once: a scan per link makes a diagram with many links quadratic
    const byEntity = new Map(
        usable.map((u) => [
            u.entity.id,
            {
                entity: u.entity,
                names: new Map(u.fields.map((f) => [f.column.id, f.name])),
            },
        ])
    );
    const nameOf = (entityId: string, columnId: string): string | undefined =>
        byEntity.get(entityId)?.names.get(columnId);
    const tableOf = (entityId: string): Entity | undefined =>
        byEntity.get(entityId)?.entity;

    // relationships that survive, each pair of columns once
    const links: Link[] = [];
    const pairs = new Set<string>();
    for (const link of listOf(design.links)) {
        if (
            !tableOf(link.sourceEntityId) ||
            !tableOf(link.targetEntityId) ||
            !nameOf(link.sourceEntityId, link.sourceColumnId) ||
            !nameOf(link.targetEntityId, link.targetColumnId)
        )
            continue;
        const a = `${link.sourceEntityId}.${link.sourceColumnId}`;
        const b = `${link.targetEntityId}.${link.targetColumnId}`;
        if (pairs.has(`${a}|${b}`) || pairs.has(`${b}|${a}`)) continue;
        pairs.add(`${a}|${b}`);
        links.push(link);
    }
    const endpoint = (entityId: string, columnId: string): string => {
        const e = tableOf(entityId)!;
        return `${qualified(e.schema, e.name)}.${q(nameOf(entityId, columnId)!)}`;
    };
    // inline form: the key sits on the field of the table that holds it
    const inlineRefs = new Map<string, string[]>();
    if (options.inline)
        for (const link of links) {
            const holderIsSource =
                link.sourceCardinality === 'many' &&
                link.targetCardinality === 'one';
            const here = holderIsSource
                ? { e: link.sourceEntityId, c: link.sourceColumnId }
                : { e: link.targetEntityId, c: link.targetColumnId };
            const there = holderIsSource
                ? { e: link.targetEntityId, c: link.targetColumnId }
                : { e: link.sourceEntityId, c: link.sourceColumnId };
            const sym =
                link.sourceCardinality === 'one' &&
                link.targetCardinality === 'one'
                    ? '-'
                    : '>';
            const key = `${here.e}.${here.c}`;
            inlineRefs.set(key, [
                ...(inlineRefs.get(key) ?? []),
                `ref: ${sym} ${endpoint(there.e, there.c)}`,
            ]);
        }

    const blocks: string[] = [];
    for (const type of listOf(design.userTypes)) {
        if (type.kind !== 'enum') continue;
        blocks.push(
            `Enum ${qualified(type.schema, type.name)} {\n${(type.values ?? [])
                .map((v) => `    ${q(v)}`)
                .join('\n')}\n}`
        );
    }
    for (const { entity, fields } of usable) {
        const pk = fields.filter((f) => f.column.primaryKey);
        const lines = fields.map(({ column, name }) => {
            const attrs: string[] = [];
            if (column.primaryKey && pk.length === 1) attrs.push('pk');
            if (column.unique && !column.primaryKey) attrs.push('unique');
            if (!column.nullable) attrs.push('not null');
            if (column.increment) attrs.push('increment');
            if (column.default && !/identity|nextval/i.test(column.default))
                attrs.push(
                    `default: ${defaultText(column.default, postgres, () =>
                        diagnostics.push({
                            severity: 'warning',
                            message: `Table ${entity.name}, field ${column.name}: a backtick in the default expression was removed, as DBML cannot hold one.`,
                        })
                    )}`
                );
            if (column.comments) attrs.push(`note: ${str(column.comments)}`);
            attrs.push(...(inlineRefs.get(`${entity.id}.${column.id}`) ?? []));
            return `  ${q(name)} ${typeText(column)}${attrs.length ? ` [${attrs.join(', ')}]` : ''}`;
        });
        const body = [...lines];
        const nameFor = (c: Column): string =>
            fields.find((f) => f.column.id === c.id)?.name ?? c.name;
        const indexLines: string[] = [];
        const pkKey = entity.keyIds
            .map((id) => design.keys[id])
            .find((k) => k?.pk);
        if (pk.length > 1)
            indexLines.push(
                `    (${pk.map((f) => q(f.name)).join(', ')}) [pk${pkKey?.label ? `, name: ${q(pkKey.label)}` : ''}]`
            );
        for (const id of entity.keyIds) {
            const key = design.keys[id];
            if (!key || key.pk) continue;
            const cols = key.members
                .map((m) => design.columns[m])
                .filter(Boolean);
            if (cols.length === 0) continue;
            const attrs = [`name: ${q(key.label)}`];
            if (key.distinct) attrs.push('unique');
            if (key.algorithm) attrs.push(`type: ${key.algorithm}`);
            if (key.note) attrs.push(`note: ${str(key.note)}`);
            const list =
                cols.length === 1
                    ? q(nameFor(cols[0]))
                    : `(${cols.map((c) => q(nameFor(c))).join(', ')})`;
            indexLines.push(`    ${list} [${attrs.join(', ')}]`);
        }
        if (indexLines.length > 0)
            body.push('', `  Indexes {\n${indexLines.join('\n')}\n  }`);
        const checks = entity.ruleIds
            .map((id) => design.rules[id]?.expression)
            .filter((e): e is string => !!e && e.trim() !== '');
        if (checks.length > 0) {
            if (checks.some((c) => c.includes('`')))
                diagnostics.push({
                    severity: 'warning',
                    message: `Table ${entity.name}: a backtick in a CHECK expression was removed, as DBML cannot hold one.`,
                });
            body.push(
                '',
                `  checks {\n${checks.map((c) => `    \`${withoutBackticks(c)}\``).join('\n')}\n  }`
            );
        }
        if (entity.comments) body.push('', `  Note: ${str(entity.comments)}`);
        blocks.push(
            `Table ${qualified(entity.schema, entity.name)} {\n${body.join('\n')}\n}`
        );
    }
    if (!options.inline)
        links.forEach((link, index) => {
            const label = link.name.replace(/[^A-Za-z0-9_]/g, '_') || 'rel';
            blocks.push(
                `Ref ${q(`fk_${index}_${label}`)}:${endpoint(link.sourceEntityId, link.sourceColumnId)} ${symbolOf(link)} ${endpoint(link.targetEntityId, link.targetColumnId)}`
            );
        });
    return { text: blocks.join('\n\n'), diagnostics };
}
