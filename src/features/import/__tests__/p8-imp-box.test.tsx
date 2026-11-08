import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportBox, QUIET_MS } from '../import-box';
import type { ImportBoxState } from '../import-box';

let last: ImportBoxState | undefined;
const onChange = (s: ImportBoxState) => {
    last = s;
};

beforeEach(() => {
    vi.useFakeTimers();
    last = undefined;
});
afterEach(() => vi.useRealTimers());

// the query script on the left is a read-only box; the paste box is the editable one
const area = () =>
    screen
        .getAllByRole('textbox')
        .find(
            (e) => !(e as HTMLTextAreaElement).readOnly
        ) as HTMLTextAreaElement;
const type = (value: string) => fireEvent.change(area(), { target: { value } });
const settle = () => act(() => void vi.advanceTimersByTime(QUIET_MS + 10));
const paste = (text: string) =>
    fireEvent.paste(area(), { clipboardData: { getData: () => text } });

describe('IMP-005 the three methods', () => {
    it('shows Database query (the default), SQL script and DBML for PostgreSQL', () => {
        render(<ImportBox databaseType="postgresql" onChange={onChange} />);
        const tabs = screen
            .getAllByRole('radio')
            .filter((r) =>
                ['Smart Query', 'SQL Script', 'DBML'].includes(
                    r.textContent ?? ''
                )
            );
        expect(tabs.map((t) => t.textContent)).toEqual([
            'Smart Query',
            'SQL Script',
            'DBML',
        ]);
        expect(tabs[0].getAttribute('aria-checked')).toBe('true');
        expect(last?.method).toBe('metadata');
    });
    it('offers no SQL tab for a database without a reader (ClickHouse)', () => {
        render(<ImportBox databaseType="clickhouse" onChange={onChange} />);
        expect(screen.getAllByRole('radio').map((t) => t.textContent)).toEqual([
            'Smart Query',
            'DBML',
        ]);
    });
});

describe('IMP-006 pasting switches to the method that fits', () => {
    it('DBML text switches to DBML and stays unformatted', () => {
        render(<ImportBox databaseType="postgresql" onChange={onChange} />);
        paste('Table a {\n  id int [pk]\n}');
        expect(
            screen
                .getByRole('radio', { name: 'DBML' })
                .getAttribute('aria-checked')
        ).toBe('true');
        expect(area().value).toBe('Table a {\n  id int [pk]\n}');
    });
    it('SQL text switches to the SQL tab', () => {
        render(<ImportBox databaseType="postgresql" onChange={onChange} />);
        paste('CREATE TABLE a (id int);');
        expect(
            screen
                .getByRole('radio', { name: 'SQL Script' })
                .getAttribute('aria-checked')
        ).toBe('true');
    });
    it('JSON goes to the query tab and is pretty printed', () => {
        render(
            <ImportBox
                databaseType="postgresql"
                initialMethod="sql"
                onChange={onChange}
            />
        );
        paste('{"a":1}');
        expect(
            screen
                .getByRole('radio', { name: 'Smart Query' })
                .getAttribute('aria-checked')
        ).toBe('true');
        expect(area().value).toBe('{\n  "a": 1\n}');
    });
});

describe('IMP-007 IMP-009 IMP-010 IMP-011 live checks', () => {
    it('reports nothing for an empty box and no design', () => {
        render(
            <ImportBox
                databaseType="postgresql"
                initialMethod="sql"
                onChange={onChange}
            />
        );
        expect(last?.analysis.design).toBeUndefined();
        expect(last?.analysis.blocked).toBe(false);
    });
    it('waits 500 ms after typing; the text is pending until then', () => {
        render(
            <ImportBox
                databaseType="postgresql"
                initialMethod="sql"
                onChange={onChange}
            />
        );
        type('CREATE TABLE a (id int PRIMARY KEY);');
        expect(last?.pending).toBe(true);
        expect(last?.analysis.design).toBeUndefined();
        act(() => void vi.advanceTimersByTime(QUIET_MS - 50));
        expect(last?.pending).toBe(true);
        settle();
        expect(last?.pending).toBe(false);
        expect(last?.analysis.design).toBeTruthy();
        expect(screen.getByTestId('import-counts').textContent).toBe(
            'Found 1 table and 0 relationships.'
        );
    });
    it('browser finding 5: the count is said once, not also as "Found 1 table to import."', () => {
        render(
            <ImportBox
                databaseType="postgresql"
                initialMethod="sql"
                onChange={onChange}
            />
        );
        type('CREATE TABLE a (id int PRIMARY KEY);');
        settle();
        expect(screen.getAllByText(/^Found \d+ tables?/)).toHaveLength(1);
        expect(screen.queryByText(/to import\.$/)).toBeNull();
    });
    it('an error blocks the import and is listed with its line; clicking it moves the cursor', () => {
        render(
            <ImportBox
                databaseType="postgresql"
                initialMethod="sql"
                onChange={onChange}
            />
        );
        const text = 'CREATE TABLE a (id int);\nCREATE TABLE b (id int';
        type(text);
        settle();
        expect(last?.analysis.blocked).toBe(true);
        const alert = screen.getByRole('alert');
        const button = alert.querySelector('button')!;
        expect(button.textContent).toMatch(/^\d+: /);
        expect(screen.queryByTestId('import-counts')).toBeNull();
        fireEvent.click(button);
        expect(area().selectionStart).toBeGreaterThan(0);
    });
    it('lists three errors and then "N more problems"', () => {
        render(
            <ImportBox
                databaseType="mysql"
                initialMethod="sql"
                onChange={onChange}
            />
        );
        type(
            [
                'CREATE TABLE a (id INT PRIMARY KEY);',
                'CREATE TABLE b (a_id INT REFERENCES a(id));',
                'CREATE TABLE c (a_id INT REFERENCES a(id));',
                'CREATE TABLE d (a_id INT REFERENCES a(id));',
                'CREATE TABLE e (a_id INT REFERENCES a(id));',
                'CREATE TABLE f (a_id INT REFERENCES a(id));',
            ].join('\n')
        );
        settle();
        const items = screen.getByRole('alert').querySelectorAll('li');
        expect(items).toHaveLength(4);
        expect(items[3].textContent).toBe('2 more problems');
    });
    it('warnings are shown in blue and do not block', () => {
        render(
            <ImportBox
                databaseType="mysql"
                initialMethod="sql"
                onChange={onChange}
            />
        );
        type('CREATE TABLE a (id SERIAL PRIMARY KEY);');
        settle();
        expect(last?.analysis.blocked).toBe(false);
        expect(last?.analysis.design).toBeTruthy();
        const warns = [...document.querySelectorAll('.text-blue-600')].map(
            (w) => w.textContent
        );
        expect(warns.some((w) => /SERIAL/i.test(w ?? ''))).toBe(true);
    });
    it('text that gives no tables says there is nothing to import', () => {
        render(
            <ImportBox
                databaseType="postgresql"
                initialMethod="sql"
                onChange={onChange}
            />
        );
        type('CREATE EXTENSION pgcrypto;');
        settle();
        expect(last?.analysis.design).toBeUndefined();
        expect(screen.getByText(/nothing to import/i)).toBeTruthy();
    });
});

describe('IMP-013 the repair button', () => {
    it('shows for a broken cast and rewrites the text after a second', () => {
        render(
            <ImportBox
                databaseType="postgresql"
                initialMethod="sql"
                onChange={onChange}
            />
        );
        type("CREATE TABLE a (id int, n text DEFAULT 'x': :text);");
        settle();
        expect(last?.analysis.blocked).toBe(true);
        fireEvent.click(
            screen.getByRole('button', { name: /Repair the text/ })
        );
        expect(screen.getByText(/Repairing the text/)).toBeTruthy();
        act(() => void vi.advanceTimersByTime(1000));
        expect(area().value).toContain("'x'::text");
        settle();
        expect(last?.analysis.blocked).toBe(false);
        expect(screen.getByText('The text was repaired.')).toBeTruthy();
    });
});

describe('IMP-058 SSMS truncation', () => {
    it('shows an information note when the text is exactly 65,535 characters', () => {
        render(<ImportBox databaseType="sql_server" onChange={onChange} />);
        type('x'.repeat(65535));
        expect(screen.getByRole('note').textContent).toContain('65,535');
    });
    it('shows nothing for other lengths', () => {
        render(<ImportBox databaseType="sql_server" onChange={onChange} />);
        type('x'.repeat(65534));
        expect(screen.queryByRole('note')).toBeNull();
    });
});

describe('IMP-064 the table picker', () => {
    const doc = (tables: number) =>
        JSON.stringify({
            database_name: 'big',
            version: 'PostgreSQL 16',
            tables: Array.from({ length: tables }, (_, i) => ({
                schema: 'public',
                table: `t${i}`,
            })),
            views: [],
            columns: Array.from({ length: tables }, (_, i) => ({
                schema: 'public',
                table: `t${i}`,
                name: 'id',
                type: 'integer',
                ordinal_position: 1,
                nullable: false,
            })),
            pk_info: [],
            fk_info: [],
            indexes: [],
        });
    it('is not shown for 50 tables', () => {
        render(<ImportBox databaseType="postgresql" onChange={onChange} />);
        type(doc(50));
        settle();
        expect(
            screen.queryByRole('region', { name: /Choose what/ })
        ).toBeNull();
        expect(last?.analysis.counts.tables).toBe(50);
    });
    it('opens for 51 tables with all selected; unticking one narrows the design', () => {
        render(<ImportBox databaseType="postgresql" onChange={onChange} />);
        type(doc(51));
        settle();
        const picker = screen.getByRole('region', { name: /Choose what/ });
        expect(picker.textContent).toContain('51 of 51 chosen');
        expect(last?.analysis.counts.tables).toBe(51);
        fireEvent.click(screen.getAllByRole('checkbox')[1]);
        expect(last?.analysis.counts.tables).toBe(50);
    });
    it('search filters the rows', () => {
        render(<ImportBox databaseType="postgresql" onChange={onChange} />);
        type(doc(60));
        settle();
        fireEvent.change(screen.getByLabelText('Search by name'), {
            target: { value: 't59' },
        });
        expect(screen.getByText('public.t59')).toBeTruthy();
        expect(screen.queryByText('public.t1')).toBeNull();
    });
});
