import React from 'react';
import { describe, expect, it } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { RefsSection } from '@/features/links/refs-section';
import { TablesSection } from '@/features/tables/tables-section';
import { UserTypesSection } from '@/features/user-types/user-types-section';
import { PANEL_LIST } from './panel-list';

describe('the lists of the side panel keep their rows clear of the scrollbar', () => {
    it('moves the scrollbar 6 px out and keeps the rows 6 px from it', () => {
        const classes = PANEL_LIST.split(' ');
        // out into the panel's own side padding, and the same distance of padding inside
        expect(classes).toContain('-mr-1.5');
        expect(classes).toContain('pr-1.5');
        // still the box that scrolls, filling the height left under the filter
        expect(classes).toEqual(
            expect.arrayContaining(['min-h-0', 'flex-1', 'overflow-y-auto'])
        );
    });

    it.each([
        ['Tables', <TablesSection key="t" />],
        ['Refs', <RefsSection key="r" />],
        ['Custom Types', <UserTypesSection key="u" />],
    ])('the %s list uses them', (_name, section) => {
        const { container } = renderPanel(section, withTables(['orders']));
        const list = container.querySelector('[data-window-root]');
        expect(list).not.toBeNull();
        expect(list?.className).toBe(PANEL_LIST);
    });
});
