import { describe, it, expect } from 'vitest';
import { generateDBMLFromDiagram } from '../dbml-export';
import { importDBMLToDiagram } from '../../dbml-import/dbml-import';
import { DatabaseType } from '@/lib/domain/database-type';

describe('DBML export with regex characters in field names', () => {
    it.each(['user(id', 'user)id', 'x+y?', '$id', 'a|b', 'a^b', 'a{2}'])(
        'puts the inline ref on a field named %s',
        async (column) => {
            const diagram = await importDBMLToDiagram(
                `
Table "users" {
  "id" int [pk]
}
Table "orders" {
  "id" int [pk]
  "${column}" int [ref: > "users"."id"]
}
`,
                { databaseType: DatabaseType.POSTGRESQL }
            );
            expect(diagram.relationships?.length).toBe(1);

            const out = generateDBMLFromDiagram(diagram);
            expect(out.inlineDbml).toContain(`"${column}" int [ref:`);
            expect(out.inlineDbml).toMatch(/ref:\s*>\s*"public"\."users"\."id"/);
        }
    );
});
