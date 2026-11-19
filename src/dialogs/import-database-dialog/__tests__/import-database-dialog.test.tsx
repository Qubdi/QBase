import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isVisible } from '@/core/model/visibility-filter';
import { withTables } from '@/core/testing/helpers';
import { DialogContext } from '@/context/dialog-context/dialog-context';
import type { DialogApi } from '@/context/dialog-context/dialog-context';
import { analyzeImport } from '@/features/import/analyze-import';
import type { Analysis } from '@/features/import/analyze-import';
import type { ImportBoxState } from '@/features/import/import-box';
import { createEditorStore } from '@/store/editor-store';
import type { EditorStore } from '@/store/editor-store';
import { selectFilter } from '@/store/selectors';
import { StoreContext } from '@/store/store-context';
import { ImportDatabaseDialog } from '../import-database-dialog';

// The paste box has its own tests: here it is a stub that reports whatever
// state the test hands it, as the real box does after its checks.
const box = vi.hoisted(() => ({
    report: undefined as ((s: ImportBoxState) => void) | undefined,
    props: undefined as Record<string, unknown> | undefined,
}));
vi.mock('@/features/import/import-box', () => ({
    ImportBox: (props: {
        onChange: (s: ImportBoxState) => void;
        [k: string]: unknown;
    }) => {
        box.report = props.onChange;
        box.props = props;
        return <div data-testid="import-box" />;
    },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/platform/toast/use-toast', () => ({ toast }));

const sql = (text: string): Analysis =>
    analyzeImport(text, {
        method: 'sql',
        databaseType: 'postgresql',
    }) as Analysis;

const TWO_TABLES = `
CREATE TABLE customers (id int PRIMARY KEY);
CREATE TABLE invoices (
    id int PRIMARY KEY,
    customer_id int REFERENCES customers(id)
);`;

const report = (analysis: Analysis, pending = false) =>
    act(() => box.report!({ method: 'sql', analysis, pending }));

const closeImportDatabaseDialog = vi.fn();
const dialogApi = { closeImportDatabaseDialog } as unknown as DialogApi;

const mount = (
    options: { store?: EditorStore; methods?: ['dbml']; open?: boolean } = {}
) => {
    const store =
        options.store ??
        createEditorStore({ design: withTables(['users', 'orders']) });
    const tree = (open: boolean) => (
        <StoreContext.Provider value={store}>
            <DialogContext.Provider value={dialogApi}>
                <ImportDatabaseDialog
                    dialog={{
                        open,
                        methods: options.methods,
                        initial: options.methods?.[0],
                    }}
                />
            </DialogContext.Provider>
        </StoreContext.Provider>
    );
    const view = render(tree(options.open ?? true));
    return {
        ...view,
        store,
        reopen: (open: boolean) => view.rerender(tree(open)),
    };
};

const applyButton = () => screen.getByRole('button', { name: 'Import' });
const names = (store: EditorStore) => {
    const d = store.getState().design;
    return d.entities.order.map((id) => d.entities.byId[id].name);
};

beforeEach(() => {
    toast.mockReset();
    closeImportDatabaseDialog.mockReset();
    box.report = undefined;
    box.props = undefined;
});

describe('ImportDatabaseDialog', () => {
    it('opens on the diagram database type with the methods it was given', () => {
        mount({ methods: ['dbml'] });
        expect(
            screen.getByRole('dialog', { name: 'Import to Current Diagram' })
        ).toBeInTheDocument();
        expect(box.props).toMatchObject({
            databaseType: 'postgresql',
            methods: ['dbml'],
            initialMethod: 'dbml',
        });
    });

    it('cannot import before the box has read anything', () => {
        mount();
        expect(applyButton()).toBeDisabled();
        expect(screen.queryByTestId('import-summary')).toBeNull();
    });

    it('sums up what will be added and imports it, clearing the history', () => {
        const { store } = mount();
        report(sql(TWO_TABLES));
        const summary = screen.getByTestId('import-summary');
        expect(summary).toHaveTextContent('2 tables will be added.');
        expect(summary).toHaveTextContent('1 relationship will be added.');
        expect(summary).not.toHaveTextContent('custom type');
        expect(summary).not.toHaveTextContent('already exist');
        expect(applyButton()).toBeEnabled();
        fireEvent.click(applyButton());
        expect(names(store)).toEqual([
            'users',
            'orders',
            'customers',
            'invoices',
        ]);
        expect(store.getState().design.links.order).toHaveLength(1);
        expect(store.getState().session.dirty).toBe(true);
        // "The history is cleared afterwards"
        expect(store.getState().undo()).toMatchObject({ ok: false });
        expect(toast).toHaveBeenCalledWith({ title: 'Added 2 tables' });
        expect(closeImportDatabaseDialog).toHaveBeenCalledTimes(1);
    });

    it('says one table, and counts custom types', () => {
        mount();
        report(
            sql(`CREATE TYPE mood AS ENUM ('sad', 'ok');
                 CREATE TABLE people (id int PRIMARY KEY, feeling mood);`)
        );
        const summary = screen.getByTestId('import-summary');
        expect(summary).toHaveTextContent('1 table will be added.');
        expect(summary).toHaveTextContent('0 relationships will be added.');
        expect(summary).toHaveTextContent('1 custom type will be added.');
    });

    it('warns about tables that are already there and will appear twice', () => {
        const { store } = mount();
        report(sql('CREATE TABLE users (id int PRIMARY KEY);'));
        expect(screen.getByRole('note')).toHaveTextContent(
            'These tables already exist and will appear twice: users'
        );
        fireEvent.click(applyButton());
        expect(names(store).filter((n) => n === 'users')).toHaveLength(2);
    });

    it('cannot import while the text is still being read', () => {
        mount();
        report(sql(TWO_TABLES), true);
        expect(applyButton()).toBeDisabled();
        expect(screen.queryByTestId('import-summary')).toBeNull();
    });

    it('cannot import text with errors', () => {
        mount();
        report({ ...sql(TWO_TABLES), blocked: true });
        expect(applyButton()).toBeDisabled();
    });

    it('cannot import text that has no tables', () => {
        mount();
        report(sql("CREATE TYPE mood AS ENUM ('a');"));
        expect(applyButton()).toBeDisabled();
        expect(screen.queryByTestId('import-summary')).toBeNull();
    });

    it('shows the new tables even when a filter was hiding everything outside a schema', () => {
        const store = createEditorStore({ design: withTables(['users']) });
        // only the "sales" schema is shown
        store.getState().setFilter({ schemaIds: ['sales'] });
        mount({ store });
        report(sql(TWO_TABLES));
        fireEvent.click(applyButton());
        const design = store.getState().design;
        const filter = selectFilter(store.getState());
        const shown = design.entities.order
            .map((id) => design.entities.byId[id])
            .filter((e) => isVisible(filter, e, 'public'))
            .map((e) => e.name);
        expect(shown).toEqual(['customers', 'invoices']);
    });

    it('leaves a filter that already shows the new tables alone', () => {
        const store = createEditorStore({ design: withTables(['users']) });
        store.getState().setFilter({ schemaIds: ['public'] });
        mount({ store });
        report(sql(TWO_TABLES));
        fireEvent.click(applyButton());
        expect(selectFilter(store.getState())).toEqual({
            schemaIds: ['public'],
        });
    });

    it('says nothing was imported when the diagram cannot be changed, and stays open', () => {
        const store = createEditorStore({
            design: withTables(['users']),
            readonly: true,
        });
        mount({ store });
        report(sql(TWO_TABLES));
        fireEvent.click(applyButton());
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Nothing was imported',
                variant: 'destructive',
            })
        );
        expect(names(store)).toEqual(['users']);
        expect(closeImportDatabaseDialog).not.toHaveBeenCalled();
    });

    it('Close, the corner cross and Escape close it without importing', () => {
        const { store } = mount();
        report(sql(TWO_TABLES));
        // the corner cross and the footer button are both called Close
        const closers = screen.getAllByRole('button', { name: 'Close' });
        expect(closers).toHaveLength(2);
        closers.forEach((b) => fireEvent.click(b));
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(closeImportDatabaseDialog).toHaveBeenCalledTimes(3);
        expect(names(store)).toEqual(['users', 'orders']);
    });

    it('starts empty again when it is opened again', () => {
        const { reopen } = mount();
        report(sql(TWO_TABLES));
        expect(applyButton()).toBeEnabled();
        reopen(false);
        reopen(true);
        expect(applyButton()).toBeDisabled();
        expect(screen.queryByTestId('import-summary')).toBeNull();
    });
});
