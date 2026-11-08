// Visual scene runner. Usage:
//   BASE_URL=http://127.0.0.1:18090 OUT=/home/qubdi/ui-reference/old node run.mjs [scene-name-filter]
// Loads every *-scenes.mjs file next to this file that exports
//   scenes = [{ name, viewport: {width, height}, theme: 'light'|'dark', async run(page) }]
// and runs each scene in a fresh browser context at its viewport, with the theme saved in
// localStorage (key "theme") before the page loads, as the app does. Per scene it writes
// <name>.png and <name>.json (measurements) into OUT. run(page) may return an object; it is
// stored under "measurements". The runner adds "viewport", "theme", "text" (visible text of the
// page) "strings" (every visible string, untruncated) and "error" (when the scene threw). The filter is a substring (or /regex/) of the name.
import process from 'node:process';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { autoMeasure, collectStrings } from './measure.mjs';
import { dumpElements } from './elements.mjs';

const { chromium } = createRequire('/tmp/pw/')('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:18090').replace(
    /\/$/,
    ''
);
const OUT = process.env.OUT || '/home/qubdi/ui-reference/new';
const filterArg = process.argv[2];
const filter = !filterArg
    ? () => true
    : filterArg.startsWith('/') && filterArg.endsWith('/')
      ? (
            (re) => (n) =>
                re.test(n)
        )(new RegExp(filterArg.slice(1, -1)))
      : (n) => n.includes(filterArg);

mkdirSync(OUT, { recursive: true });
const files = readdirSync(here)
    .filter((f) => f.endsWith('-scenes.mjs'))
    .sort();
const scenes = [];
for (const f of files) {
    const mod = await import(pathToFileURL(path.join(here, f)).href);
    for (const s of mod.scenes || []) scenes.push(s);
}

const browser = await chromium.launch();
let failed = 0;
let ran = 0;
for (const scene of scenes.filter((s) => filter(s.name))) {
    ran++;
    const context = await browser.newContext({
        viewport: scene.viewport,
        colorScheme: scene.theme === 'dark' ? 'dark' : 'light',
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
        acceptDownloads: true,
    });
    await context.addInitScript((theme) => {
        try {
            localStorage.setItem('theme', theme);
        } catch {
            /* storage blocked */
        }
    }, scene.theme);
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    const rec = {
        name: scene.name,
        viewport: scene.viewport,
        theme: scene.theme,
        base: BASE,
    };
    try {
        await page.goto(BASE + (scene.path || '/'), { waitUntil: 'load' });
        await page.waitForTimeout(600);
        rec.measurements = (await scene.run(page)) ?? {};
        rec.measurements.auto = await autoMeasure(page);
    } catch (e) {
        rec.error = String(e.message || e).split('\n')[0];
        failed++;
    }
    try {
        await page.waitForTimeout(250);
        rec.strings = await collectStrings(page);
        rec.text = await page.evaluate(() =>
            document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 4000)
        );
        await page.screenshot({ path: path.join(OUT, `${scene.name}.png`) });
        writeFileSync(
            path.join(OUT, `${scene.name}.elements.json`),
            JSON.stringify(await dumpElements(page))
        );
    } catch (e) {
        rec.error =
            (rec.error ? rec.error + ' | ' : '') +
            'screenshot: ' +
            String(e.message).split('\n')[0];
    }
    writeFileSync(
        path.join(OUT, `${scene.name}.json`),
        JSON.stringify(rec, null, 2)
    );
    console.log(
        `${rec.error ? 'FAIL' : 'ok  '} ${scene.name}${rec.error ? '  ' + rec.error : ''}`
    );
    await context.close();
}
await browser.close();
console.log(`${ran} scenes run, ${failed} failed, output in ${OUT}`);
process.exit(0);
