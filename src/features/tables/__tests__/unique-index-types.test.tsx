import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { planAddColumn, planAddKey } from '@/core/commands/plan-column';
import type { Column } from '@/core/model/column';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { defaultMethodOf } from '@/core/model/index-methods';
import type { KeyMethod } from '@/core/model/key';
import { applyOk, withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { IndexesEditor } from '../indexes-editor';

// A unique index cannot hold every column type: PostgreSQL has no btree for json, MySQL
// needs a prefix length on text, SQL Server and Oracle cannot key on their large objects.
// The Unique key button and the Unique switch stay grey for such a column, so the index
// cannot be marked unique. An index that is already unique can always be turned off.

/** The reason, shown in the attributes popover (not the "hash: Cannot be unique" lines). */
const HINT = /Cannot be unique: the database cannot index/;

/**
 * One table (`id` plus a `payload` column of `type`) and one index on `payload`, which is
 * unique when `distinct` is set.
 */
function design(
    db: DatabaseType,
    type: string,
    over: Partial<Column> = {},
    distinct = false,
    algorithm?: KeyMethod
): Design {
    let d = withTables(['orders'], db);
    const table = d.entities.byId[d.entities.order[0]];
    d = applyOk(
        d,
        planAddColumn(d, table.id, {
            name: 'payload',
            type: { id: type, name: type.replace(/_/g, ' ') },
            ...over,
        })!
    ).design;
    const entity = d.entities.byId[d.entities.order[0]];
    const payload = entity.columnIds[entity.columnIds.length - 1];
    return applyOk(
        d,
        planAddKey(d, entity.id, {
            members: [payload],
            distinct,
            // left out when not given: an explicit undefined would clear the default type
            ...(algorithm ? { algorithm } : {}),
        })!
    ).design;
}

const show = (d: Design) =>
    renderPanel(
        <IndexesEditor entity={d.entities.byId[d.entities.order[0]]} />,
        d
    );

const row = () => within(screen.getByTestId('index-row'));
const keyButton = () =>
    row().getByRole('button', { name: 'Unique' }) as HTMLButtonElement;
const theIndex = (d: Design) => Object.values(d.keys).find((k) => !k.pk)!;

async function openAttributes() {
    await userEvent.click(
        row().getByRole('button', { name: 'Index attributes' })
    );
    return (await screen.findByRole('switch', {
        name: 'Unique',
    })) as HTMLButtonElement;
}

describe('a unique index on a column type the database cannot index', () => {
    it.each([
        ['postgresql', 'json', {}],
        ['postgresql', 'xml', {}],
        ['postgresql', 'point', {}],
        ['mysql', 'text', {}],
        ['mysql', 'json', {}],
        ['mysql', 'geometry', {}],
        ['mariadb', 'longblob', {}],
        ['sql_server', 'text', {}],
        ['sql_server', 'xml', {}],
        ['sql_server', 'nvarchar', { length: 'max' }],
        ['oracle', 'clob', {}],
        ['oracle', 'long_raw', {}],
    ] as const)(
        'cannot be marked on %s for a %s column (%j)',
        async (db, type, over) => {
            const { store } = show(design(db, type, { ...over }));
            const button = keyButton();
            expect(button.disabled).toBe(true);
            // a disabled button takes no pointer events: its wrapper carries the reason
            expect(button.parentElement?.getAttribute('title')).toContain(
                `payload (${type.replace(/_/g, ' ')})`
            );

            const toggle = await openAttributes();
            expect(toggle.disabled).toBe(true);
            expect(screen.getByText(HINT)).toBeTruthy();

            // neither control changes anything
            await userEvent.click(toggle);
            await userEvent.click(button);
            expect(theIndex(store.getState().design).distinct).toBe(false);
        }
    );

    it('names only the columns that cause it, and also blocks a mix with an ordinary column', async () => {
        const d = design('postgresql', 'json');
        const entity = d.entities.byId[d.entities.order[0]];
        const key = theIndex(d);
        const both = applyOk(d, {
            type: 'part.update',
            entityId: entity.id,
            part: 'keys',
            id: key.id,
            patch: { members: [entity.columnIds[0], entity.columnIds[1]] },
        }).design;
        show(both);
        expect(keyButton().disabled).toBe(true);
        await openAttributes();
        const hint = screen.getByText(HINT).textContent;
        expect(hint).toContain('payload (json)');
        expect(hint).not.toContain('id (');
    });

    it('is blocked as soon as such a column is chosen for the index', async () => {
        // an index on `id` alone can be unique; adding `payload` (json) closes it
        const d = design('postgresql', 'json');
        const entity = d.entities.byId[d.entities.order[0]];
        const key = theIndex(d);
        const onId = applyOk(d, {
            type: 'part.update',
            entityId: entity.id,
            part: 'keys',
            id: key.id,
            patch: { members: [entity.columnIds[0]] },
        }).design;
        show(onId);
        expect(keyButton().disabled).toBe(false);

        await userEvent.click(
            row().getByRole('button', { name: 'Select fields' })
        );
        await userEvent.click(
            await screen.findByRole('checkbox', { name: 'payload' })
        );
        expect(keyButton().disabled).toBe(true);
    });

    it('can still be turned off when the index is already unique', async () => {
        const { store } = show(design('postgresql', 'json', {}, true));
        const button = keyButton();
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        // the reason is still given in the attributes popover
        const toggle = await openAttributes();
        expect(toggle.disabled).toBe(false);
        expect(screen.getByText(HINT)).toBeTruthy();

        await userEvent.click(button);
        expect(theIndex(store.getState().design).distinct).toBe(false);
        // and now that it is off, it is closed again
        expect(keyButton().disabled).toBe(true);
    });
});

describe('Unique on an index of a type that cannot be unique', () => {
    // hash, gin... cannot be unique. Switching Unique on used to change the type to
    // btree behind the user's back; now Unique stays grey and the type stays.
    it.each([
        ['postgresql', 'hash', 'integer'],
        ['postgresql', 'gist', 'integer'],
        ['postgresql', 'gin', 'jsonb'],
        ['postgresql', 'spgist', 'text'],
        ['postgresql', 'brin', 'integer'],
        ['mysql', 'fulltext', 'varchar'],
        ['mariadb', 'fulltext', 'varchar'],
        ['mysql', 'spatial', 'point'],
        ['sql_server', 'columnstore', 'int'],
        ['sql_server', 'xml', 'xml'],
        ['oracle', 'bitmap', 'number'],
    ] as const)(
        'cannot be marked on %s for a %s index (%s field) and the type stays',
        async (db, method, type) => {
            const { store } = show(design(db, type, {}, false, method));
            const button = keyButton();
            expect(button.disabled).toBe(true);
            const reason = `a ${method} index cannot be unique. Change the index type to ${defaultMethodOf(db)} first.`;
            expect(button.parentElement?.getAttribute('title')).toContain(
                reason
            );

            const toggle = await openAttributes();
            expect(toggle.disabled).toBe(true);
            expect(screen.getByText(new RegExp(reason))).toBeTruthy();

            await userEvent.click(toggle);
            await userEvent.click(button);
            expect(theIndex(store.getState().design)).toMatchObject({
                distinct: false,
                algorithm: method,
            });
        }
    );

    it('opens as soon as the type is changed to one that can be unique', async () => {
        const { store } = show(
            design('postgresql', 'integer', {}, false, 'hash')
        );
        expect(keyButton().disabled).toBe(true);
        const toggle = await openAttributes();
        expect(toggle.disabled).toBe(true);

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Index type' })
        );
        await userEvent.click(
            await screen.findByRole('option', { name: 'btree' })
        );
        expect(keyButton().disabled).toBe(false);
        expect(toggle.disabled).toBe(false);
        expect(screen.queryByText(/index cannot be unique/)).toBeNull();

        await userEvent.click(toggle);
        expect(theIndex(store.getState().design)).toMatchObject({
            distinct: true,
            algorithm: 'btree',
        });
    });

    it('can still be turned off when an index of that type is already unique', async () => {
        const { store } = show(
            design('postgresql', 'integer', {}, true, 'hash')
        );
        const button = keyButton();
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        await userEvent.click(button);
        expect(theIndex(store.getState().design)).toMatchObject({
            distinct: false,
            algorithm: 'hash',
        });
        // and now that it is off, it is closed again
        expect(keyButton().disabled).toBe(true);
    });

    it('gives both reasons when the field type and the index type both refuse', async () => {
        show(design('postgresql', 'json', {}, false, 'hash'));
        expect(keyButton().disabled).toBe(true);
        await openAttributes();
        expect(screen.getByText(HINT)).toBeTruthy();
        expect(screen.getByText(/a hash index cannot be unique/)).toBeTruthy();
    });

    it('leaves the primary-key index alone: its Unique button is not greyed', () => {
        const d = withTables(['orders'], 'postgresql');
        renderPanel(
            <IndexesEditor entity={d.entities.byId[d.entities.order[0]]} />,
            d
        );
        const pk = within(screen.getByTestId('primary-key-index'));
        expect(
            (pk.getByRole('button', { name: 'Unique' }) as HTMLButtonElement)
                .disabled
        ).toBe(false);
    });
});

describe('a unique index on a column type the database can index', () => {
    it.each([
        ['postgresql', 'jsonb', {}],
        ['postgresql', 'text', {}],
        ['mysql', 'varchar', { length: 100 }],
        ['sql_server', 'nvarchar', { length: 200 }],
        ['oracle', 'varchar2', { length: 100 }],
        ['sqlite', 'json', {}],
        ['sqlite', 'blob', {}],
    ] as const)(
        'can be marked on %s for a %s column (%j)',
        async (db, type, over) => {
            const { store } = show(design(db, type, { ...over }));
            const button = keyButton();
            expect(button.disabled).toBe(false);
            expect(button.parentElement?.getAttribute('title')).toBeNull();
            expect(screen.queryByText(HINT)).toBeNull();

            await userEvent.click(button);
            expect(theIndex(store.getState().design).distinct).toBe(true);
            const toggle = await openAttributes();
            expect(toggle.disabled).toBe(false);
            expect(toggle.getAttribute('aria-checked')).toBe('true');
        }
    );

    it('is switched on and off by the Unique switch in the attributes popover, as Field Attributes does', async () => {
        const { store } = show(design('postgresql', 'text'));
        const toggle = await openAttributes();
        // a switch like the ones in Field Attributes, not a checkbox
        expect(toggle.getAttribute('role')).toBe('switch');
        expect(screen.queryByRole('checkbox', { name: 'Unique' })).toBeNull();
        expect(toggle.getAttribute('aria-checked')).toBe('false');

        await userEvent.click(toggle);
        expect(theIndex(store.getState().design).distinct).toBe(true);
        expect(toggle.getAttribute('aria-checked')).toBe('true');
        // the key button in the row follows
        expect(keyButton().getAttribute('aria-pressed')).toBe('true');

        await userEvent.click(toggle);
        expect(theIndex(store.getState().design).distinct).toBe(false);
        expect(keyButton().getAttribute('aria-pressed')).toBe('false');
    });
});
