// Scenes for everything outside the canvas surface: first-visit dialog, navbar and its menus,
// side panel sections, dialogs, wizards. Selectors use the OLD editor's wording.
import {
    DESKTOP,
    PHONE,
    phoneDrawer,
    phoneManage,
    startEmpty,
    addTable,
    sideTab,
    menu,
    menuItem,
    viaMenu,
    languageButton,
    hover,
    settle,
    measure,
    measureAll,
    rootVars,
} from './steps.mjs';

const defs = [];
// def(name, themes, viewport, run): one scene per theme, named <name>-<theme> (and -phone for PHONE).
const def = (name, themes, viewport, run, path) => {
    for (const theme of themes)
        defs.push({
            name: `${name}${viewport === PHONE && !name.includes('phone') ? '-phone' : ''}-${theme}`,
            viewport,
            theme,
            run,
            path,
        });
};
const BOTH = ['light', 'dark'];
const L = ['light'];

const tokens = async (page) => ({
    vars: await rootVars(page),
    body: await measure(page.locator('body')),
});

// ---- first visit: "What is your Database?" ----
def('tokens-first-visit', BOTH, DESKTOP, async (page) => ({
    ...(await tokens(page)),
    dialog: await measure(page.getByRole('dialog')),
    title: await measure(
        page.getByRole('heading', { name: 'What is your Database?' })
    ),
    tabs: await measure(page.getByRole('tablist')),
    tabActive: await measure(page.getByRole('tab', { name: 'Transactional' })),
    tabInactive: await measure(page.getByRole('tab', { name: 'Analytical' })),
    logo: await measure(page.getByRole('radio').first()),
    logoImages: await measureAll(page, '[role=dialog] img', [
        'width',
        'height',
        'objectFit',
    ]),
    cancel: await measure(page.getByRole('button', { name: 'Cancel' })),
    empty: await measure(page.getByRole('button', { name: 'Empty database' })),
    cont: await measure(page.getByRole('button', { name: 'Continue' })),
    close: await measure(page.getByRole('button', { name: 'Close' })),
    examples: await measure(page.getByRole('link', { name: 'Check Examples' })),
}));
def('new-diagram-analytical', L, DESKTOP, async (page) => {
    await page.getByRole('tab', { name: 'Analytical' }).click();
    await settle(page);
});
def('new-diagram-more-databases', BOTH, DESKTOP, async (page) => {
    await page.getByRole('button', { name: 'More Databases' }).click();
    await settle(page, 500);
});
def('new-diagram-db-selected', L, DESKTOP, async (page) => {
    await page.getByRole('radio').nth(1).hover();
    await settle(page);
    return { hoverLogo: await measure(page.getByRole('radio').nth(1)) };
});
def('new-diagram-phone', BOTH, PHONE, async (page) => ({
    dialog: await measure(page.getByRole('dialog')),
}));

// ---- import step after choosing a database ----
const pickPostgres = async (page) => {
    await page.getByRole('radio').nth(1).click();
    await settle(page, 700);
};
def('import-database-smart-query', BOTH, DESKTOP, pickPostgres);
def('import-database-sql-script', L, DESKTOP, async (page) => {
    await pickPostgres(page);
    await page.getByText('SQL Script').click();
    await settle(page);
});
def('import-database-dbml', L, DESKTOP, async (page) => {
    await pickPostgres(page);
    await page.getByRole('dialog').getByText('DBML', { exact: true }).click();
    await settle(page);
});
def('import-database-phone', L, PHONE, pickPostgres);

// ---- empty editor ----
def('editor-empty', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    return {
        ...(await tokens(page)),
        navLogo: await measure(page.getByRole('link', { name: 'QBase' })),
        menubar: await measure(page.getByRole('menubar')),
        menuTop: await measure(page.getByRole('menuitem', { name: 'Actions' })),
        diagramName: await measure(
            page.getByRole('heading', { name: 'Diagram 1' })
        ),
        saved: await measure(page.getByLabel('Saved just now')),
        lint: await measure(page.getByRole('button', { name: 'Lint' })),
        rail: await measure(
            page.getByRole('button', { name: 'Tables', exact: true })
        ),
        railNew: await measure(
            page.getByRole('button', { name: 'New', exact: true })
        ),
        filter: await measure(page.getByPlaceholder('Filter')),
        addTable: await measure(
            page.getByRole('button', { name: 'Add Table' }).first()
        ),
        emptyTitle: await measure(page.getByText('No tables')),
        emptyText: await measure(
            page.getByText('Create a table to get started')
        ),
    };
});
def('editor-empty-phone', BOTH, PHONE, async (page) => {
    await startEmpty(page);
});
def('phone-drawer', BOTH, PHONE, async (page) => {
    await startEmpty(page);
    await phoneDrawer(page);
});
def('phone-manage-diagram', BOTH, PHONE, async (page) => {
    await startEmpty(page);
    await phoneManage(page);
});
def('phone-manage-diagram-section-list', L, PHONE, async (page) => {
    await startEmpty(page);
    await phoneManage(page);
    await page.getByRole('combobox').first().click();
    await settle(page, 400);
});
def('phone-manage-diagram-table', L, PHONE, async (page) => {
    await startEmpty(page);
    await phoneManage(page);
    await page.getByRole('button', { name: 'Add Table' }).first().click();
    await settle(page, 600);
});
def('phone-navbar-language', L, PHONE, async (page) => {
    await startEmpty(page);
    await languageButton(page);
});
def('phone-menu-view', L, PHONE, async (page) => {
    await startEmpty(page);
    await menu(page, 'View');
});

// ---- top menus ----
for (const top of ['Actions', 'Edit', 'View', 'Backup']) {
    def(
        `menu-${top.toLowerCase()}`,
        top === 'View' ? BOTH : L,
        DESKTOP,
        async (page) => {
            await startEmpty(page);
            await menu(page, top);
            return {
                content: await measure(page.getByRole('menu')),
                item: await measure(page.getByRole('menuitem').first()),
                sep: await measure(page.getByRole('separator').first()),
            };
        }
    );
}
def('menu-actions-export-as', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Actions', 'Export as');
});
def('menu-view-theme', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'View', 'Theme');
});
def('menu-view-zoom-on-scroll', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'View', 'Zoom on Scroll');
});
def('menu-view-database-views', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'View', 'Database Views');
});
def('menu-item-hover', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await menu(page, 'View');
    await page.getByRole('menuitem', { name: 'Compact Tables' }).hover();
    await settle(page, 300);
    return {
        hovered: await measure(
            page.getByRole('menuitem', { name: 'Compact Tables' })
        ),
    };
});

// ---- navbar bits ----
def('language-popover', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await languageButton(page);
});
def('language-list', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await languageButton(page);
    await page.getByText('English').first().click();
    await settle(page);
});
def('lint-panel', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await page.getByRole('button', { name: 'Lint' }).click();
    await settle(page, 500);
    return { pill: await measure(page.getByRole('button', { name: 'Lint' })) };
});
def('saved-tooltip', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await hover(page, page.getByLabel('Saved just now'));
});
def('diagram-name-edit', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await page.getByRole('heading', { name: 'Diagram 1' }).click();
    await settle(page);
});
def('navbar-hover-focus', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await page.getByRole('menuitem', { name: 'Edit' }).hover();
    await settle(page, 300);
    const hovered = await measure(page.getByRole('menuitem', { name: 'Edit' }));
    await page.getByRole('menuitem', { name: 'Backup' }).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await settle(page, 300);
    return {
        hovered,
        focusedBackup: await measure(
            page.getByRole('menuitem', { name: 'Backup' })
        ),
    };
});

// ---- side panel: tables ----
def('rail-hover-selected', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await page.getByRole('button', { name: 'Refs', exact: true }).hover();
    await settle(page, 300);
    return {
        selected: await measure(
            page.getByRole('button', { name: 'Tables', exact: true })
        ),
        hovered: await measure(
            page.getByRole('button', { name: 'Refs', exact: true })
        ),
    };
});
def('tables-filter-focus', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await page.getByPlaceholder('Filter').focus();
    await settle(page, 250);
    return { filterFocus: await measure(page.getByPlaceholder('Filter')) };
});
def('tables-one-table', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    return {
        header: await measure(page.getByRole('heading', { name: 'table_1' })),
        section: await measure(page.getByRole('heading', { name: 'Fields' })),
        nameInput: await measure(page.getByPlaceholder('Name').first()),
        addField: await measure(
            page.getByRole('button', { name: 'Add Field' }).first()
        ),
        addIndex: await measure(
            page.getByRole('button', { name: 'Add Index' })
        ),
        colorSwatch: await measure(page.getByLabel('Change color')),
    };
});
def('tables-type-select-open', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByText('bigint', { exact: true }).first().click();
    await settle(page, 400);
});
def('tables-field-attributes', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    // the "more" button right after the name box of the first field row
    const more = page
        .getByPlaceholder('Name')
        .first()
        .locator('xpath=following::button[@aria-haspopup="dialog"]');
    await more.nth((await more.count()) > 1 ? 1 : 0).focus();
    await page.keyboard.press('Enter');
    await settle(page, 500);
});
def('tables-indexes-open', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByRole('heading', { name: 'Indexes' }).click();
    await settle(page, 500);
});
def('tables-checks-open', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByRole('heading', { name: 'Check Constraints' }).click();
    await settle(page, 500);
});
def('tables-description-open', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByRole('heading', { name: 'Description' }).click();
    await settle(page, 500);
});
def('tables-color-picker', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByLabel('Change color').click();
    await settle(page, 500);
});
def('tables-table-menu', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page
        .getByRole('button', { name: /^(More actions|Table Actions)$/ })
        .first()
        .focus();
    await page.keyboard.press('Enter');
    await settle(page, 500);
});
def('tables-row-hover', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.mouse.move(250, 110);
    await settle(page, 400);
});
def('tables-two-tables-collapsed', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByRole('button', { name: 'Add Table' }).first().click();
    await settle(page, 500);
    await page.getByText('table_2', { exact: true }).first().click();
    await settle(page, 500);
});
def('tables-filter-no-match', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByPlaceholder('Filter').fill('zzz');
    await settle(page, 500);
});

// ---- other side panel sections ----
def('refs-panel-empty', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'Refs');
});
def('custom-types-panel-empty', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'Custom Types');
});
def('visuals-panel', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'Visuals');
});
def('dbml-panel', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await sideTab(page, 'DBML');
    await settle(page, 700);
});
def('phone-dbml', L, PHONE, async (page) => {
    await startEmpty(page);
    await phoneManage(page, 'DBML');
});

// ---- dialogs reached from the rail and menus ----
def('dialog-open-diagram', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'Open');
});
def('dialog-new-diagram-from-rail', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'New');
});
def('menu-actions-import', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Actions', 'Import');
});
for (const kind of ['SQL', 'DBML', '.json']) {
    def(
        `dialog-import-${kind.replace('.', '')}`,
        kind === 'SQL' ? BOTH : L,
        DESKTOP,
        async (page) => {
            await startEmpty(page);
            await viaMenu(page, 'Actions', 'Import');
            await page
                .getByRole('menuitem', { name: kind, exact: true })
                .click();
            await settle(page, 700);
        }
    );
}
def('dialog-export-sql', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await viaMenu(page, 'Actions', 'Export SQL');
    await menuItem(page, 'PostgreSQL');
    await settle(page, 1200);
});
def('dialog-export-sql-empty-error', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Actions', 'Export SQL');
    await menuItem(page, 'PostgreSQL');
    await settle(page, 1200);
});
def('dialog-clear', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Edit', 'Clear');
});
def('dialog-delete', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Actions', 'Delete');
});
def('dialog-backup-restore', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Backup', 'Restore Diagram');
});
def('phone-menu-actions', L, PHONE, async (page) => {
    await startEmpty(page);
    await menu(page, 'Actions');
});

// ---- the legend popover next to the canvas toolbar ----
def('type-colours-popover', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await page.getByText('Type colours').click();
    await settle(page, 400);
});

// ---- the old Examples and Templates pages ----
const pageMetrics = async (page) => ({
    h1: await measure(page.locator('h1').first()),
    cards: await measureAll(
        page,
        'main a[href^="/templates/"], main a[href^="/examples"], a[href*="database"]',
        [
            'backgroundColor',
            'borderTopColor',
            'borderTopWidth',
            'borderTopLeftRadius',
            'fontFamily',
            'fontSize',
        ],
        6
    ),
    tags: await measureAll(
        page,
        'a[href^="/templates/tags/"]',
        [
            'color',
            'backgroundColor',
            'fontSize',
            'fontWeight',
            'borderTopLeftRadius',
        ],
        6
    ),
});
def('page-examples', BOTH, DESKTOP, pageMetrics, '/examples');
def('page-examples-phone', L, PHONE, pageMetrics, '/examples');
def(
    'page-examples-card-hover',
    L,
    DESKTOP,
    async (page) => {
        await page.getByText('Bike stores schema').hover();
        await settle(page, 400);
        return pageMetrics(page);
    },
    '/examples'
);
def('page-templates', BOTH, DESKTOP, pageMetrics, '/templates');
def('page-templates-phone', L, PHONE, pageMetrics, '/templates');
def('page-templates-featured', L, DESKTOP, pageMetrics, '/templates/featured');
def(
    'page-templates-tag-mysql',
    L,
    DESKTOP,
    pageMetrics,
    '/templates/tags/mysql'
);
def(
    'page-templates-card-hover',
    L,
    DESKTOP,
    async (page) => {
        await page.getByText('Pokemon information').hover();
        await settle(page, 400);
    },
    '/templates'
);
def(
    'page-template-detail',
    BOTH,
    DESKTOP,
    pageMetrics,
    '/templates/employees-database'
);
def(
    'page-template-detail-phone',
    L,
    PHONE,
    pageMetrics,
    '/templates/employees-database'
);
def('page-not-found', L, DESKTOP, async () => ({}), '/no-such-page');

// ---- scenes that need two tables ----
const twoTables = async (page) => {
    await startEmpty(page);
    await page.getByRole('button', { name: 'Add Table' }).first().click();
    await settle(page, 500);
    await page.getByRole('button', { name: 'Add Table' }).first().click();
    await settle(page, 500);
};
def('refs-panel-two-tables', L, DESKTOP, async (page) => {
    await twoTables(page);
    await sideTab(page, 'Refs');
});
def('dialog-create-relationship', BOTH, DESKTOP, async (page) => {
    await twoTables(page);
    await sideTab(page, 'Refs');
    await page
        .getByRole('button', { name: 'Add Relationship' })
        .first()
        .click();
    await settle(page, 500);
});
def('dialog-create-relationship-select-open', L, DESKTOP, async (page) => {
    await twoTables(page);
    await sideTab(page, 'Refs');
    await page
        .getByRole('button', { name: 'Add Relationship' })
        .first()
        .click();
    await page.getByText('Select table').first().click();
    await settle(page, 500);
});
def('custom-types-new-type', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'Custom Types');
    await page.getByRole('button', { name: 'New Type' }).first().click();
    await settle(page, 500);
});
def('custom-types-type-expanded', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'Custom Types');
    await page.getByRole('button', { name: 'New Type' }).first().click();
    await settle(page, 500);
    await page.getByText('type_1').first().click();
    await settle(page, 500);
});
def('visuals-areas-one', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'Visuals');
    await page.getByRole('button', { name: 'Add Area' }).first().click();
    await settle(page, 500);
});
def('visuals-notes-empty', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'Visuals');
    await page.getByRole('tab', { name: 'Notes' }).click();
    await settle(page);
});
def('visuals-notes-one', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await sideTab(page, 'Visuals');
    await page.getByRole('tab', { name: 'Notes' }).click();
    await page.getByRole('button', { name: 'Add Note' }).first().click();
    await settle(page, 500);
});
def('filter-panel', BOTH, DESKTOP, async (page) => {
    await twoTables(page);
    await page.getByRole('button', { name: 'Filter Tables' }).click();
    await settle(page, 500);
});
def('filter-panel-group-by-area', L, DESKTOP, async (page) => {
    await twoTables(page);
    await page.getByRole('button', { name: 'Filter Tables' }).click();
    await page.getByText('Group by Area').click();
    await settle(page, 500);
});
def('dialog-export-image', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Actions', 'Export as');
    await menuItem(page, 'PNG');
});
def('dialog-export-image-advanced', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Actions', 'Export as');
    await menuItem(page, 'PNG');
    await page.getByText('Advanced Options').click();
    await settle(page, 500);
});
def('dialog-export-json', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Actions', 'Export as');
    await menuItem(page, 'JSON');
});
def('menu-actions-export-sql', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Actions', 'Export SQL');
});
def('dbml-panel-buttons-hover', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await sideTab(page, 'DBML');
    await settle(page, 700);
    await page.mouse.move(375, 70);
    await settle(page, 900);
});
def('dbml-copy-toast', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await sideTab(page, 'DBML');
    await settle(page, 700);
    await page.mouse.click(375, 70);
    await settle(page, 600);
});
def('dbml-edit-mode', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await sideTab(page, 'DBML');
    await settle(page, 700);
    await page.mouse.click(375, 138);
    await settle(page, 600);
});

// ---- shared primitives in every state (measured on the export dialog and the import wizard) ----
const overElement = async (page, locator) => {
    const box = await locator.first().boundingBox();
    if (box)
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
};
const states = async (page, locator, withActive = true) => {
    const out = { default: await measure(locator) };
    try {
        return await statesInner(page, locator, withActive, out);
    } catch (e) {
        out.error = String(e.message).split('\n')[0];
        return out;
    }
};
const statesInner = async (page, locator, withActive, out) => {
    await overElement(page, locator);
    await settle(page, 300);
    out.hover = await measure(locator);
    if (!withActive) {
        await page.mouse.move(5, 5);
        return out;
    }
    await page.mouse.move(5, 5);
    await locator.focus({ timeout: 2000 }).catch(() => {});
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await settle(page, 300);
    out.focus = await measure(locator);
    await overElement(page, locator);
    await page.mouse.down();
    await settle(page, 200);
    out.active = await measure(locator);
    await page.mouse.move(5, 5);
    await page.mouse.up();
    return out;
};
def('primitives-export-dialog', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await viaMenu(page, 'Actions', 'Export as');
    await menuItem(page, 'PNG');
    await page.getByText('Advanced Options').click();
    await settle(page, 400);
    return {
        dialog: await measure(page.getByRole('dialog')),
        title: await measure(
            page.getByRole('heading', { name: 'Export Image' })
        ),
        select: await states(page, page.getByText('4x (Best Quality)'), false),
        primary: await states(
            page,
            page.getByRole('button', { name: 'Export', exact: true })
        ),
        secondary: await states(
            page,
            page.getByRole('button', { name: 'Cancel' })
        ),
        checkbox: await measure(page.getByRole('checkbox').first()),
        switches: await measureAll(page, '[role=switch]', [
            'backgroundColor',
            'width',
            'height',
        ]),
    };
});
def('primitives-import-wizard', L, DESKTOP, async (page) => {
    await pickPostgres(page);
    return {
        outline: await states(
            page,
            page.getByRole('button', { name: 'Empty database' })
        ),
        disabled: await measure(page.getByRole('button', { name: 'Import' })),
        back: await states(page, page.getByRole('button', { name: 'Back' })),
        link: await measure(page.getByRole('link', { name: /Need help/ })),
    };
});
def('primitives-inputs', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    const out = {};
    out.fieldName = await measure(page.getByPlaceholder('Name').first());
    out.nullableOff = await measure(
        page.getByRole('button', { name: 'N', exact: true })
    );
    out.pkOn = await measure(page.locator('button[aria-pressed=true]').first());
    const input = page.getByPlaceholder('Filter');
    out.filter = await measure(input);
    await input.focus();
    out.filterFocus = await measure(input);
    await input.fill('abc');
    out.filterFilled = await measure(input);
    return out;
});
def('scrollbars-type-list', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByText('bigint', { exact: true }).first().click();
    await settle(page, 400);
    return {
        listbox: await measure(page.getByRole('listbox')),
        option: await measure(page.getByRole('option').first()),
    };
});
def('toast-copy-sql', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await viaMenu(page, 'Actions', 'Export SQL');
    await menuItem(page, 'PostgreSQL');
    await settle(page, 1200);
    return {
        toast: await measureAll(
            page,
            '[role=region] li, [data-sonner-toast], [role=status]',
            ['backgroundColor', 'color', 'borderTopLeftRadius', 'boxShadow'],
            4
        ),
    };
});
def('lint-panel-with-issues', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByRole('button', { name: 'Add Table' }).first().click();
    await settle(page, 500);
    await page.getByRole('button', { name: /Lint/ }).click();
    await settle(page, 600);
});
def('open-diagram-with-list', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await sideTab(page, 'Open');
    await settle(page, 500);
});

def('tables-name-tooltip', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page.getByText('table_1', { exact: true }).first().hover();
    await settle(page, 1400);
    return {
        tooltip: await measureAll(
            page,
            '[role=tooltip], [data-radix-popper-content-wrapper] > *',
            [
                'backgroundColor',
                'color',
                'fontSize',
                'borderTopLeftRadius',
                'boxShadow',
            ],
            3
        ),
    };
});

def('sidebar-hidden', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await page.keyboard.press('Control+b');
    await settle(page, 500);
});
def('sidebar-resized-wide', L, DESKTOP, async (page) => {
    await startEmpty(page);
    await page.mouse.move(360, 300);
    await page.mouse.down();
    await page.mouse.move(700, 300, { steps: 8 });
    await page.mouse.up();
    await settle(page, 400);
    return { separator: await measure(page.getByRole('separator').first()) };
});

def('dialog-change-schema', BOTH, DESKTOP, async (page) => {
    await startEmpty(page);
    await addTable(page);
    await page
        .getByRole('button', { name: /^(More actions|Table Actions)$/ })
        .first()
        .focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Change Schema' }).click();
    await settle(page, 500);
});

export const scenes = defs;
