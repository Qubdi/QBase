import { describe, expect, it } from 'vitest';
import type { Diagram } from '@/lib/domain/diagram';
import { examples } from '@/pages/examples-page/examples-data/examples-data';
import { templates } from '../templates-data';

const manyToMany = (diagram: Diagram) =>
    (diagram.relationships ?? [])
        .filter(
            (r) =>
                r.sourceCardinality === 'many' && r.targetCardinality === 'many'
        )
        .map((r) => r.name);

describe('the diagrams that ship with the app', () => {
    it('hold no many-to-many relationship: that is a junction table', () => {
        const found = [
            ...templates.map((t) => ({ name: t.name, diagram: t.diagram })),
            ...examples.map((e) => ({ name: e.name, diagram: e.diagram })),
        ]
            .map(({ name, diagram }) => ({
                name,
                relationships: manyToMany(diagram),
            }))
            .filter((x) => x.relationships.length > 0);

        expect(found).toEqual([]);
    });
});
