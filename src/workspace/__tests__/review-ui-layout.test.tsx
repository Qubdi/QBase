import React from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { MobileNavbar } from '../navbar/top-navbar';
import { Rail } from '../rail';
import { renderInEditor } from './test-harness';
import { i18n, i18nReady } from '@/i18n/i18n';

describe('browser findings: layout', () => {
    it('2: a long rail label wraps and keeps its full text in the title', async () => {
        await i18nReady;
        await i18n.changeLanguage('de');
        await expect
            .poll(() => i18n.hasResourceBundle('de', 'translation'))
            .toBe(true);
        renderInEditor(<Rail />, { design: withTables(['a']) });
        const button = screen.getByTitle('Beziehungen');
        const label = button.querySelector('span')!;
        expect(label.className).toContain('[overflow-wrap:anywhere]');
        await i18n.changeLanguage('en');
    });

    it('4: the phone bar has three grid rows: brand, menus, then the name', () => {
        renderInEditor(
            <MobileNavbar
                commands={{} as never}
                railOpen={false}
                onToggleRail={() => undefined}
            />,
            { design: { ...withTables(['a']), name: 'Shop' } }
        );
        // brand and language on the first row, the menus on the second, the name below
        const row = screen.getByTestId('phone-name-row');
        expect(row.className).toContain('row-start-3');
        expect(
            screen.getByRole('menubar').closest('div[class*="row-start-2"]')
        ).not.toBeNull();
    });
});
