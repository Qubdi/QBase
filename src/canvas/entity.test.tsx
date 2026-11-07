import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { shop, withColumns } from './test/fixtures';
import { renderCanvas } from './test/render';
import {
    KIND_CLASSES,
    chipText,
    shownColumns,
    subtitleParts,
    typeKind,
} from './field-view';
import { clampWidth, toggledWidth } from './geometry';
import { createColumn } from '@/core/model/defaults';
import { dimmedEntities } from './flow-model';
import { commitShapes } from './commit-shapes';

const column = (over: object = {}) => ({
    ...createColumn({ databaseType: 'postgresql' }, 0, { now: 1 }),
    ...over,
});

describe('field rows and chips', () => {
    it('EDT-046: type chips are tinted by the kind of type', () => {
        const cases: [string, string][] = [
            ['uuid', 'identifier'],
            ['guid', 'identifier'],
            ['uniqueidentifier', 'identifier'],
            ['boolean', 'flag'],
            ['bit', 'flag'],
            ['timestamp', 'moment'],
            ['datetime', 'moment'],
            ['interval', 'moment'],
            ['year', 'moment'],
            ['jsonb', 'document'],
            ['xml', 'document'],
            ['hstore', 'document'],
            ['integer', 'number'],
            ['numeric', 'number'],
            ['money', 'number'],
            ['varchar', 'text'],
            ['citext', 'text'],
        ];
        for (const [name, kind] of cases) expect(typeKind(name)).toBe(kind);
        expect(new Set(Object.keys(KIND_CLASSES)).size).toBe(6);
    });

    it('EDT-113: the chip shows the first word of the type plus size, precision, scale or []', () => {
        const pg = 'postgresql' as const;
        expect(
            chipText(
                column({
                    type: { id: 'double precision', name: 'double precision' },
                }),
                pg,
                true
            )
        ).toBe('double');
        expect(
            chipText(
                column({
                    type: { id: 'varchar', name: 'varchar' },
                    length: 255,
                }),
                pg,
                true
            )
        ).toBe('varchar(255)');
        expect(
            chipText(
                column({
                    type: { id: 'numeric', name: 'numeric' },
                    precision: 10,
                    scale: 2,
                }),
                pg,
                true
            )
        ).toBe('numeric(10, 2)');
        expect(
            chipText(
                column({ type: { id: 'int', name: 'int' }, isArray: true }),
                pg,
                true
            )
        ).toBe('int[]');
    });

    it('EDT-114: hiding field attributes leaves the name and the array mark', () => {
        const c = column({
            type: { id: 'varchar', name: 'varchar' },
            length: 50,
            isArray: true,
        });
        expect(chipText(c, 'postgresql', false)).toBe('varchar[]');
        expect(chipText(c, 'mysql', false)).toBe('varchar');
    });

    it('EDT-083: a long table collapses to ten, keeping key and linked fields', () => {
        const cols = Array.from({ length: 14 }, (_, i) =>
            column({ id: `c${i}`, name: `f${i}`, primaryKey: i === 12 })
        );
        const linked = new Set(['c13']);
        const shown = shownColumns(cols, false, linked).map((c) => c.id);
        expect(shown).toHaveLength(10);
        expect(shown).toContain('c12');
        expect(shown).toContain('c13');
        expect(shown.slice(0, 8)).toEqual([
            'c0',
            'c1',
            'c2',
            'c3',
            'c4',
            'c5',
            'c6',
            'c7',
        ]);
        expect(shownColumns(cols, true, linked)).toHaveLength(14);
        expect(shownColumns(cols.slice(0, 10), false, new Set())).toHaveLength(
            10
        );
    });

    it('EDT-083: a collapsed table never drops key or linked fields even past ten', () => {
        const cols = Array.from({ length: 16 }, (_, i) =>
            column({ id: `c${i}`, primaryKey: i >= 4 && i < 16 && i % 1 === 0 })
        );
        const shown = shownColumns(cols, false, new Set());
        expect(shown).toHaveLength(12);
    });
});

describe('entity card', () => {
    it('EDT-078: shows swatch, bold name, subtitle with schema and first note line, and a field count', () => {
        const { design, users } = shop();
        const withNote = {
            ...design,
            entities: {
                ...design.entities,
                byId: {
                    ...design.entities.byId,
                    [users]: {
                        ...design.entities.byId[users],
                        comments: 'Accounts\nsecond line',
                    },
                },
            },
        };
        renderCanvas(withNote);
        const card = screen.getByTestId(`entity-${users}`);
        expect(within(card).getByText('users')).toHaveClass('font-bold');
        expect(within(card).getByText('public · Accounts')).toBeInTheDocument();
        expect(within(card).getByTitle('1 field')).toHaveTextContent('1');
        expect(within(card).getByTestId(`swatch-${users}`)).toHaveAttribute(
            'data-hollow',
            'false'
        );
    });

    it('EDT-087: the full description is the tooltip of the subtitle', () => {
        const { design, users } = shop();
        const withNote = {
            ...design,
            entities: {
                ...design.entities,
                byId: {
                    ...design.entities.byId,
                    [users]: {
                        ...design.entities.byId[users],
                        comments: 'Accounts\nsecond line',
                    },
                },
            },
        };
        renderCanvas(withNote);
        const subtitle = screen.getByText('public \u00b7 Accounts');
        expect(subtitle).toHaveAttribute('title', 'Accounts\nsecond line');
    });

    it('EDT-085: a view has a hollow swatch and says view in the subtitle', () => {
        const { design, items } = shop();
        const asView = {
            ...design,
            entities: {
                ...design.entities,
                byId: {
                    ...design.entities.byId,
                    [items]: {
                        ...design.entities.byId[items],
                        kind: 'view' as const,
                        materialized: true,
                    },
                },
            },
        };
        renderCanvas(asView);
        expect(screen.getByTestId(`swatch-${items}`)).toHaveAttribute(
            'data-hollow',
            'true'
        );
        expect(screen.getByText(/materialized view/)).toBeInTheDocument();
        expect(
            subtitleParts(
                { kind: 'view', schema: 'v' },
                { view: 'view', materializedView: 'mv' }
            )
        ).toEqual(['v', 'view']);
    });

    it('EDT-112: a row shows a key icon, a link icon for foreign keys, UQ badge, chip and nullability dot', () => {
        const { design, users, orders, orderUser, userKey } = shop();
        renderCanvas(design);
        const keyRow = screen.getByTestId(`field-${userKey}`);
        expect(
            within(keyRow).getByLabelText('Primary key')
        ).toBeInTheDocument();
        expect(within(keyRow).getByText('bigint')).toBeInTheDocument();
        expect(within(keyRow).getByLabelText('Required')).toBeInTheDocument();
        const fkRow = screen.getByTestId(`field-${orderUser}`);
        expect(within(fkRow).getByLabelText('Foreign key')).toBeInTheDocument();
        expect(within(fkRow).getByLabelText('Can be empty')).toHaveAttribute(
            'data-nullable',
            'true'
        );
        expect(
            within(screen.getByTestId(`entity-${users}`)).queryByLabelText(
                'Foreign key'
            )
        ).toBeNull();
        expect(orders).toBeTruthy();
    });

    it('EDT-115: compact tables show names only', () => {
        const { design, userKey } = shop();
        renderCanvas(design, { canvas: { prefs: { compact: true } } });
        const row = screen.getByTestId(`field-${userKey}`);
        expect(within(row).queryByText('bigint')).toBeNull();
        expect(within(row).queryByLabelText('Required')).toBeNull();
    });

    it('EDT-114: the prefs switch hides sizes in chips on the canvas', () => {
        const { design, orderUser } = shop();
        const sized = {
            ...design,
            columns: {
                ...design.columns,
                [orderUser]: {
                    ...design.columns[orderUser],
                    type: { id: 'varchar', name: 'varchar' },
                    length: 40,
                },
            },
        };
        const view = renderCanvas(sized, {
            canvas: { prefs: { showFieldAttributes: false } },
        });
        expect(
            within(screen.getByTestId(`field-${orderUser}`)).getByText(
                'varchar'
            )
        ).toBeInTheDocument();
        view.unmount();
        renderCanvas(sized);
        expect(
            within(screen.getByTestId(`field-${orderUser}`)).getByText(
                'varchar(40)'
            )
        ).toBeInTheDocument();
    });

    it('EDT-083: Show more expands a long table and the state is saved on the entity', () => {
        const { design, users } = shop();
        const long = withColumns(design, users, 14);
        const { store } = renderCanvas(long);
        const card = screen.getByTestId(`entity-${users}`);
        expect(card.querySelectorAll('[data-testid^="field-"]')).toHaveLength(
            10
        );
        fireEvent.click(within(card).getByText('Show more'));
        expect(store.getState().design.entities.byId[users].expanded).toBe(
            true
        );
        expect(card.querySelectorAll('[data-testid^="field-"]')).toHaveLength(
            15
        );
        expect(within(card).getByText('Show less')).toBeInTheDocument();
        // the expansion is a view setting, not an undo step
        expect(store.getState().history.undo).toHaveLength(0);
    });

    it('EDT-152, EDT-157: field dots are offered in an editable table, never on a view', () => {
        const { design, users, items } = shop();
        const asView = {
            ...design,
            entities: {
                ...design.entities,
                byId: {
                    ...design.entities.byId,
                    [items]: {
                        ...design.entities.byId[items],
                        kind: 'view' as const,
                    },
                },
            },
        };
        renderCanvas(asView);
        const dots = (id: string) =>
            screen
                .getByTestId(`entity-${id}`)
                .querySelectorAll('.react-flow__handle.connectable');
        expect(dots(users).length).toBe(2);
        expect(dots(items).length).toBe(0);
    });

    it('EDT-014: a read-only diagram has no connect dots and no header buttons', () => {
        const { design, users } = shop();
        renderCanvas(design, { store: { readonly: true } });
        const card = screen.getByTestId(`entity-${users}`);
        expect(
            card.querySelectorAll('.react-flow__handle.connectable')
        ).toHaveLength(0);
        expect(within(card).queryByLabelText('Open in side panel')).toBeNull();
    });

    it('EDT-079: the header buttons open the table in the side panel and toggle the width', () => {
        const { design, users } = shop();
        const { store } = renderCanvas(design);
        const card = screen.getByTestId(`entity-${users}`);
        fireEvent.click(within(card).getByLabelText('Open in side panel'));
        expect(store.getState().ui.panel.expandedEntityId).toBe(users);
        expect(store.getState().ui.panel.section).toBe('tables');
        fireEvent.click(within(card).getByLabelText('Make wider'));
        expect(store.getState().design.entities.byId[users].width).toBe(450);
        fireEvent.click(within(card).getByLabelText('Make narrower'));
        expect(store.getState().design.entities.byId[users].width).toBe(224);
    });

    it('EDT-116: hovering a row shows a card with the full details and the other end of links', async () => {
        const { design, orderUser } = shop();
        renderCanvas(design);
        fireEvent.mouseEnter(screen.getByTestId(`field-${orderUser}`));
        const card = await screen.findByRole('tooltip', { hidden: true });
        expect(card).toHaveTextContent('references users.id');
    });

    it('EDT-088: double-clicking a table opens the editor form supplied by the workspace, and it can close', () => {
        const { design, users } = shop();
        renderCanvas(design, {
            canvas: {
                hooks: {
                    renderEntityEditor: ({ entityId, close }) => (
                        <button type="button" onClick={close}>
                            editor of {entityId}
                        </button>
                    ),
                },
            },
        });
        fireEvent.doubleClick(screen.getByTestId(`entity-${users}`));
        const editor = screen.getByText(`editor of ${users}`);
        fireEvent.click(editor);
        expect(screen.queryByText(`editor of ${users}`)).toBeNull();
        expect(screen.getByTestId(`entity-${users}`)).toBeInTheDocument();
    });
});

describe('selection, fade and sizes', () => {
    it('EDT-025: a selected table has the accent outline', () => {
        const { design, users } = shop();
        const { store } = renderCanvas(design);
        act(() => store.getState().select([users]));
        expect(screen.getByTestId(`entity-${users}`)).toHaveAttribute(
            'data-selected',
            'true'
        );
        expect(screen.getByTestId(`entity-${users}`).className).toContain(
            'ring-primary'
        );
        act(() => store.getState().select([]));
        expect(screen.getByTestId(`entity-${users}`)).toHaveAttribute(
            'data-selected',
            'false'
        );
    });

    it('EDT-032: selecting a table fades the tables that are neither selected nor linked', () => {
        const { design, users, orders, items } = shop();
        const dimmed = dimmedEntities(design, new Set([users]));
        expect([...dimmed]).toEqual([items]);
        expect(dimmedEntities(design, new Set([orders])).size).toBe(1);
        expect(dimmedEntities(design, new Set()).size).toBe(0);
        const { store } = renderCanvas(design);
        act(() => store.getState().select([users]));
        expect(screen.getByTestId(`entity-${items}`).className).toContain(
            'opacity-40'
        );
        expect(screen.getByTestId(`entity-${orders}`).className).not.toContain(
            'opacity-40'
        );
    });

    it('EDT-080, EDT-082: width stays in 224..450 and the button toggles between the two ends', () => {
        expect(clampWidth(100)).toBe(224);
        expect(clampWidth(900)).toBe(450);
        expect(clampWidth(300)).toBe(300);
        expect(toggledWidth(undefined)).toBe(450);
        expect(toggledWidth(224)).toBe(450);
        expect(toggledWidth(337)).toBe(450);
        expect(toggledWidth(450)).toBe(224);
    });

    it('EDT-081: a resize sends one width command, clamped, and it is undoable', () => {
        const { design, users } = shop();
        const { store } = renderCanvas(design);
        const command = commitShapes(store.getState().design, {
            positions: {},
            sizes: { [users]: { width: 700 } },
        });
        expect(command).toBeDefined();
        act(() => void store.getState().edit(command!));
        expect(store.getState().design.entities.byId[users].width).toBe(450);
        act(() => void store.getState().undo());
        expect(
            store.getState().design.entities.byId[users].width
        ).toBeUndefined();
    });

    it('EDT-033: only a selected, editable table gets the left and right resize lines', () => {
        const { design, users } = shop();
        const { store } = renderCanvas(design);
        const lines = () =>
            screen
                .getByTestId(`entity-${users}`)
                .querySelectorAll('.react-flow__resize-control');
        expect(lines()).toHaveLength(0);
        act(() => store.getState().select([users]));
        expect(lines()).toHaveLength(2);
    });
});
