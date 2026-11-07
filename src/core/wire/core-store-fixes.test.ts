/* eslint-disable @typescript-eslint/no-explicit-any -- hand-edited JSON fixtures */
import { describe, expect, it } from 'vitest';
import { listOf } from '../model/collection';
import { NOW, rng } from '../testing/helpers';
import { shop } from './fixtures/shop';
import { parse } from './parse';
import { serialise } from './serialise';

const read = (json: unknown) => parse(json, { now: NOW, random: rng() });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function tiny(tables: any[], relationships: any[] = []) {
    const base = clone(shop) as any;
    return {
        ...base,
        tables,
        relationships,
        dependencies: [],
        areas: [],
        customTypes: [],
        notes: [],
    };
}

describe('review core-store 16: wire edge cases', () => {
    it('keeps a column whose id is __proto__ (with a warning)', () => {
        const json = tiny([
            {
                id: 't1',
                name: 't',
                fields: [
                    {
                        id: '__proto__',
                        name: 'a',
                        type: { id: 'int', name: 'int' },
                    },
                    { id: 'b', name: 'b', type: { id: 'int', name: 'int' } },
                ],
                indexes: [
                    { id: '__proto__', name: 'i', fieldIds: ['__proto__'] },
                ],
                checkConstraints: [{ id: '__proto__', expression: 'a > 0' }],
            },
        ]);
        const { design, warnings } = read(json);
        const e = listOf(design.entities)[0];
        expect(e.columnIds).toHaveLength(2);
        expect(e.keyIds).toHaveLength(1);
        expect(e.ruleIds).toHaveLength(1);
        expect(design.keys[e.keyIds[0]].members).toHaveLength(1);
        expect(warnings.some((w) => /not allowed/.test(w.message))).toBe(true);
        expect(Object.keys(design.columns)).toHaveLength(2);
    });

    it('keeps a link to the first table when two tables share an id', () => {
        const json = tiny(
            [
                {
                    id: 'dup',
                    name: 'one',
                    fields: [
                        {
                            id: 'f',
                            name: 'a',
                            type: { id: 'int', name: 'int' },
                        },
                    ],
                },
                {
                    id: 'dup',
                    name: 'two',
                    fields: [
                        {
                            id: 'g',
                            name: 'b',
                            type: { id: 'int', name: 'int' },
                        },
                    ],
                },
                {
                    id: 'x',
                    name: 'x',
                    fields: [
                        {
                            id: 'h',
                            name: 'c',
                            type: { id: 'int', name: 'int' },
                        },
                    ],
                },
            ],
            [
                {
                    id: 'r',
                    sourceTableId: 'dup',
                    sourceFieldId: 'f',
                    targetTableId: 'x',
                    targetFieldId: 'h',
                },
            ]
        );
        const { design, warnings } = read(json);
        expect(design.links.order).toHaveLength(1);
        const link = design.links.byId[design.links.order[0]];
        expect(design.entities.byId[link.sourceEntityId].name).toBe('one');
        expect(warnings.some((w) => /used twice/.test(w.message))).toBe(true);
    });

    it('keeps extra keys on the column type object', () => {
        const json = tiny([
            {
                id: 't',
                name: 't',
                fields: [
                    {
                        id: 'f',
                        name: 'a',
                        type: {
                            id: 'int',
                            name: 'int',
                            foo: 1,
                            bar: { x: [2] },
                        },
                    },
                ],
            },
        ]);
        const { design } = read(json);
        const out: any = serialise(design);
        expect(out.tables[0].fields[0].type).toEqual({
            id: 'int',
            name: 'int',
            foo: 1,
            bar: { x: [2] },
        });
    });

    it('serialises and stringifies a design with a very deep unknown value', () => {
        let deep: unknown = 1;
        for (let i = 0; i < 20000; i++) deep = [deep];
        const json = tiny([{ id: 't', name: 't', fields: [], hostile: deep }]);
        const { design } = read(json);
        const out = serialise(design);
        expect(() => JSON.stringify(out)).not.toThrow();
    });
});
