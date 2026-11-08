// UI steps in the OLD editor's wording, shared by the scene files. Every step uses roles, names,
// placeholders and visible text only, so it also drives the new editor once its text matches.
import { measure, measureAll, rootVars } from './measure.mjs';

export const DESKTOP = { width: 1280, height: 800 };
export const PHONE = { width: 390, height: 844 };

export const settle = (page, ms = 350) => page.waitForTimeout(ms);

// Starts from the first-visit "What is your Database?" dialog: pick PostgreSQL, then "Empty database".
export async function startEmpty(page) {
    await page.getByRole('radio').nth(1).click();
    await page.getByRole('button', { name: 'Empty database' }).click();
    await page.getByRole('menubar').waitFor();
    await settle(page, 600);
}

// Phone layout: the hamburger button at the top left opens a left drawer with the rail items;
// choosing one opens the full-screen "Manage Diagram" sheet.
export async function phoneDrawer(page) {
    await page.mouse.click(30, 26);
    await settle(page, 600);
}

export async function phoneManage(page, section = 'Tables') {
    await phoneDrawer(page);
    await page.getByRole('button', { name: section, exact: true }).click();
    await page.getByText('Manage Diagram').first().waitFor();
    await settle(page, 600);
}

export async function addTable(page) {
    await page.getByRole('button', { name: 'Add Table' }).first().click();
    await settle(page, 600);
}

export async function sideTab(page, name) {
    await page.getByRole('button', { name, exact: true }).first().click();
    await settle(page);
}

export async function menu(page, name) {
    await page.getByRole('menuitem', { name, exact: true }).click();
    await settle(page);
}

export async function menuItem(page, name) {
    await page.getByRole('menuitem', { name }).first().click();
    await settle(page);
}

export async function languageButton(page) {
    await page.getByText('Change language').click({ force: true });
    await settle(page);
}

export const press = async (page, key) => {
    await page.keyboard.press(key);
    await settle(page, 250);
};

export async function hover(page, locator) {
    await locator.hover();
    await settle(page, 900);
}

// Opens a top menu then clicks an item inside it.
export async function viaMenu(page, top, item) {
    await menu(page, top);
    await menuItem(page, item);
}

export { measure, measureAll, rootVars };
