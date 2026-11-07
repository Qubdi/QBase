import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listOf } from '@/core/model/collection';
import { sampleS1 } from '@/dialects/testing/sample-designs';
import { usePreviewStore } from '@/features/dbml-diff/preview-store';
import { exportDbml } from '@/formats/dbml/export-dbml';
import { renderPanel } from '@/features/testing/render-panel';
import { DbmlSection, PARSE_DELAY_MS } from './dbml-section';

const design = sampleS1('postgresql');
const original = exportDbml(design).text;
const added = `${original}\nTable "extra" {\n  "id" integer [pk]\n}\n`;

function setup(readonly = false) {
    const view = renderPanel(<DbmlSection />, design, { readonly });
    act(() => view.store.getState().showPanel('dbml'));
    return view;
}
const box = () => screen.getByLabelText('DBML text') as HTMLTextAreaElement;
const type = (value: string) => {
    fireEvent.change(box(), { target: { value } });
    act(() => void vi.advanceTimersByTime(PARSE_DELAY_MS));
};

beforeEach(() => {
    vi.useFakeTimers();
    usePreviewStore.getState().clear();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('EDT-238 EDT-239 the DBML section', () => {
    it('is read-only text with an Edit button for an editable design', () => {
        setup();
        expect(screen.getByText(/Table "customers"/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Show inline refs' })
        ).toBeTruthy();
        expect(screen.queryByLabelText('DBML text')).toBeNull();
    });

    it('has no Edit button when the design is read-only', () => {
        setup(true);
        expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    });

    it('Edit opens the text; with no diff the button reads View and leaves', () => {
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(box().value).toBe(original);
        expect(
            screen.queryByRole('button', { name: 'Accept Changes' })
        ).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'View' }));
        expect(screen.queryByLabelText('DBML text')).toBeNull();
    });

    it('does not parse before the pause', () => {
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.change(box(), { target: { value: added } });
        act(() => void vi.advanceTimersByTime(PARSE_DELAY_MS - 100));
        expect(usePreviewStore.getState().marks).toBeUndefined();
        act(() => void vi.advanceTimersByTime(100));
        expect(usePreviewStore.getState().marks).toBeDefined();
    });
});

describe('EDT-240 a syntax error', () => {
    it('marks the line and shows the red message', () => {
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        type('Table a {\n  id int [pk]\n}\nTable {\n');
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toMatch(
            /^Failed to parse DBML\. Please check the syntax\. \(1 error found - in line \d+\)$/
        );
        const line = Number(/line (\d+)/.exec(alert.textContent!)![1]);
        const marked = document.querySelector('[data-line-error="true"]');
        expect(marked).toBeTruthy();
        expect(
            [...document.querySelectorAll('[data-line-error]')].indexOf(marked!)
        ).toBe(line - 1);
        expect(usePreviewStore.getState().marks).toBeUndefined();
    });
});

describe('EDT-241 EDT-244 a valid edit', () => {
    it('shows a diff without changing the design and offers Accept and Undo', () => {
        const { store } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        type(added);
        const marks = usePreviewStore.getState().marks!;
        expect(Object.values(marks.tables)).toEqual(['added']);
        expect(store.getState().design).toBe(design);
        expect(
            screen.getByRole('button', { name: 'Accept Changes' })
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Undo Changes' })
        ).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'View' })).toBeNull();
    });

    it('typing the text back removes the diff', () => {
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        type(added);
        type(original);
        expect(usePreviewStore.getState().marks).toBeUndefined();
        expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
    });
});

describe('EDT-245 Accept Changes', () => {
    it('replaces the tables as one undo step and leaves edit mode', () => {
        const { store } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        type(added);
        fireEvent.click(screen.getByRole('button', { name: 'Accept Changes' }));
        const now = store.getState().design;
        expect(listOf(now.entities).map((e) => e.name)).toContain('extra');
        expect(usePreviewStore.getState().marks).toBeUndefined();
        expect(screen.queryByLabelText('DBML text')).toBeNull();
        act(() => void store.getState().undo());
        expect(
            listOf(store.getState().design.entities).map((e) => e.name)
        ).not.toContain('extra');
        expect(store.getState().design.entities.order).toEqual(
            design.entities.order
        );
    });
});

describe('EDT-246 Undo Changes', () => {
    it('discards the preview, keeps the design, leaves edit mode', () => {
        const { store } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        type(added);
        fireEvent.click(screen.getByRole('button', { name: 'Undo Changes' }));
        expect(usePreviewStore.getState().marks).toBeUndefined();
        expect(store.getState().design).toBe(design);
        expect(screen.queryByLabelText('DBML text')).toBeNull();
        expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    });
});

describe('EDT-247 leaving the section', () => {
    const preview = () => {
        const view = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        type(added);
        expect(usePreviewStore.getState().marks).toBeDefined();
        return view;
    };
    it('switching section discards the preview', () => {
        const { store } = preview();
        act(() => store.getState().showPanel('refs'));
        expect(usePreviewStore.getState().marks).toBeUndefined();
    });
    it('closing the panel discards the preview', () => {
        const { store } = preview();
        act(() => void store.getState().hidePanel());
        expect(usePreviewStore.getState().marks).toBeUndefined();
    });
    it('unmounting discards the preview', () => {
        const { unmount } = preview();
        unmount();
        expect(usePreviewStore.getState().marks).toBeUndefined();
    });
});
