import { describe, expect, it } from 'vitest';
import { withFields } from '@/core/testing/helpers';
import { buildTree, setTableShown } from '../filter-tree';

// The Search & Filter panel finds a table by its name and by the names of its
// fields; the fields that match come with the table. The search only narrows
// the list: it never changes which tables are shown.

describe('the search finds fields as well as tables', () => {
    const design = withFields({
        customers: ['email'],
        orders: ['customer_email', 'notify_email', 'total'],
        users: ['Email', 'email_verified_at', 'name'],
        products: ['sku'],
    });
    const tree = (text: string, filter = {}) =>
        buildTree({ design, filter, groupBy: 'schema', text, showViews: true });
    const tables = (text: string) =>
        tree(text).flatMap((g) =>
            g.tables.map((t) => [t.entity.name, t.fields.map((f) => f.name)])
        );

    it('lists a table when one of its field names has the text, with those fields', () => {
        expect(tables('email')).toEqual([
            ['customers', ['email']],
            ['orders', ['customer_email', 'notify_email']],
            ['users', ['Email', 'email_verified_at']],
        ]);
    });

    it('ignores case, in the text and in the names, and spaces around the text', () => {
        expect(tables('EMAIL')).toEqual(tables('email'));
        expect(tables('  email ')).toEqual(tables('email'));
    });

    it('lists a table found by its name with no fields when none of them matches', () => {
        expect(tables('prod')).toEqual([['products', []]]);
    });

    it('lists a table found by both, with the fields that match', () => {
        const both = withFields({ email_log: ['email', 'sent_at'] });
        const found = buildTree({
            design: both,
            filter: {},
            groupBy: 'schema',
            text: 'email',
            showViews: true,
        });
        expect(found[0].tables.map((t) => t.fields.map((f) => f.name))).toEqual(
            [['email']]
        );
    });

    it('lists no fields when there is no text', () => {
        const all = tables('');
        expect(all).toHaveLength(4);
        expect(all.every(([, fields]) => fields.length === 0)).toBe(true);
    });

    it('lists nothing, not even an empty group, when nothing matches', () => {
        expect(tree('zzz')).toEqual([]);
    });

    it('does not change which tables are shown', () => {
        const filter = setTableShown(
            design,
            {},
            design.entities.order[0],
            false
        );
        const found = tree('email', filter).flatMap((g) => g.tables);
        expect(found.map((t) => [t.entity.name, t.shown])).toEqual([
            ['customers', false],
            ['orders', true],
            ['users', true],
        ]);
    });
});
