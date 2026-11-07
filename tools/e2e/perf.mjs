// Performance measurements of the BUILT app (local-only mode) on large
// diagrams of 50, 200 and 500 tables, built by importing a generated SQL script
// and by loading a diagram file. Run it with tools/e2e/run-perf.sh.
//
// Every number is measured in the page (performance.now, frame times from
// requestAnimationFrame, long tasks, Event Timing) or from CDP (JS heap, and
// with PROFILE=1 a CPU profile of each slow phase). The script prints a table
// of results against the thresholds and writes $OUT/perf-results.json.
//   SIZES=50,200  SOURCES=sql,json  PROFILE=1  SKIP_BUILD=1
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const { chromium } = createRequire('/tmp/pw/')('playwright');
const OUT = process.env.OUT || '/tmp/qbase-perf';
const PORT = 4177;
const BASE = `http://localhost:${PORT}`;
const DIST = `${OUT}/dist`;
const SIZES = (process.env.SIZES || '50,200,500').split(',').map(Number);
const SOURCES = (process.env.SOURCES || 'sql,json').split(',');
const PROFILE = Boolean(process.env.PROFILE);
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ data

/** A PostgreSQL script: n tables of 8 columns, about one link per table. */
function makeSql(n) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
        const parent =
            i === 0 ? undefined : (((i * 2654435761) % 4294967296) >>> 7) % i;
        const cols = [
            'id integer NOT NULL',
            parent === undefined
                ? 'owner_id integer'
                : `owner_id integer REFERENCES public.t_${parent}(id)`,
            'name character varying(60) NOT NULL',
            'email character varying(120)',
            'created_at timestamp without time zone',
            'amount numeric(10,2)',
            'active boolean DEFAULT true',
            'notes text',
        ];
        out.push(
            `CREATE TABLE public.t_${i} (\n    ${cols.join(',\n    ')},\n    PRIMARY KEY (id)\n);`
        );
    }
    return out.join('\n');
}

/** The exported file with some areas (one per 20 tables) added to it. */
function withAreas(text, n) {
    const file = JSON.parse(text);
    const count = Math.max(1, Math.floor(n / 20));
    file.areas = Array.from({ length: count }, (_, i) => ({
        id: `area-${i}`,
        name: `Area ${i}`,
        x: (i % 10) * 900,
        y: Math.floor(i / 10) * 900,
        width: 800,
        height: 800,
        color: '#8eb7ff',
        order: i,
    }));
    return JSON.stringify(file);
}

// ------------------------------------------------------------------ in-page recorder

const RECORDER = `(() => {
  const w = window;
  w.__perf = { frames: [], longTasks: [], events: [], idb: [], recording: false };
  const P = w.__perf;
  let last = performance.now();
  const tick = (t) => {
    if (P.recording) P.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        P.longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        P.events.push({ name: e.name, start: e.startTime, duration: e.duration });
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch {}
  // storage writes: time spent in the call (structured clone) and until the transaction ends
  for (const method of ['put', 'add']) {
    const original = IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method] = function (...args) {
      const t0 = performance.now();
      const result = original.apply(this, args);
      const sync = performance.now() - t0;
      const tx = this.transaction;
      tx.addEventListener('complete', () =>
        P.idb.push({ at: t0, sync, total: performance.now() - t0, store: this.name })
      );
      return result;
    };
  }
  w.__perf.reset = () => {
    P.frames.length = 0; P.longTasks.length = 0; P.events.length = 0; P.idb.length = 0;
    P.t0 = performance.now(); P.recording = true;
  };
  w.__perf.stop = () => { P.recording = false; };
  // time from the next event of the given kind to the next painted frame in which pred() holds
  w.__perf.timeTo = (kind, pred, timeout = 20000) => new Promise((resolve) => {
    let t0;
    const onEvent = (e) => { if (t0 === undefined) t0 = e.timeStamp; };
    w.addEventListener(kind, onEvent, true);
    const started = performance.now();
    const poll = () => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (t0 !== undefined && pred()) {
            w.removeEventListener(kind, onEvent, true);
            resolve(performance.now() - t0);
          } else if (performance.now() - started > timeout) {
            w.removeEventListener(kind, onEvent, true);
            resolve(-1);
          } else poll();
        }, 0);
      });
    };
    poll();
  });
})();`;

// ------------------------------------------------------------------ helpers

const results = []; // { size, source, metric, value, unit, limit }
const profiles = [];
let page;
let cdp;

const pause = (ms) => page.waitForTimeout(ms);
const note = (size, source, metric, value, unit = 'ms', limit) => {
    results.push({ size, source, metric, value, unit, limit });
    console.log(
        `  ${String(size).padStart(3)} ${source.padEnd(4)} ${metric.padEnd(34)} ${
            typeof value === 'number'
                ? value.toFixed(unit === 'MB' ? 1 : 0)
                : value
        } ${unit}${limit === undefined ? '' : `  (limit ${limit})`}`
    );
};
const pct = (values, p) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const waitQuiet = async (ms = 500) => {
    // no long task for `ms`
    for (let i = 0; i < 100; i += 1) {
        const idle = await page.evaluate((quiet) => {
            const tasks = window.__perf.longTasks;
            const last = tasks.length
                ? tasks[tasks.length - 1].start +
                  tasks[tasks.length - 1].duration
                : 0;
            return performance.now() - last > quiet;
        }, ms);
        if (idle) return;
        await pause(100);
    }
};
const startRecording = () => page.evaluate(() => window.__perf.reset());
const stopRecording = () =>
    page.evaluate(() => {
        window.__perf.stop();
        return {
            frames: window.__perf.frames.slice(),
            longTasks: window.__perf.longTasks.slice(),
            events: window.__perf.events.slice(),
            idb: window.__perf.idb.slice(),
            t0: window.__perf.t0,
        };
    });

/** A Chrome trace of `fn`: time per event kind (layout, style, paint, raster, script). */
async function traced(label, fn) {
    if (!process.env.TRACE) return fn();
    const events = [];
    cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
    await cdp.send('Tracing.start', {
        transferMode: 'ReportEvents',
        traceConfig: {
            includedCategories: [
                'devtools.timeline',
                'disabled-by-default-devtools.timeline',
                'cc',
                'gpu',
                'viz',
            ],
        },
    });
    try {
        return await fn();
    } finally {
        const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
        await cdp.send('Tracing.end');
        await done;
        const sums = new Map();
        for (const e of events) {
            if (e.ph !== 'X' || e.dur === undefined) continue;
            const key = `${e.name} (pid ${e.pid} tid ${e.tid})`;
            sums.set(key, (sums.get(key) ?? 0) + e.dur);
        }
        const text = [...sums.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 40)
            .map(([k, v]) => `${(v / 1000).toFixed(1).padStart(9)} ms  ${k}`)
            .join('\n');
        writeFileSync(`${OUT}/trace-${label.replace(/\W+/g, '-')}.txt`, text);
    }
}

async function profiled(label, fn) {
    if (process.env.TRACE) return traced(label, fn);
    if (!PROFILE) return fn();
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    try {
        return await fn();
    } finally {
        const { profile } = await cdp.send('Profiler.stop');
        profiles.push({ label, profile });
        summariseProfile(label, profile);
    }
}

function summariseProfile(label, profile) {
    const self = new Map();
    const total = new Map();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of profile.nodes)
        for (const c of n.children ?? []) parent.set(c, n.id);
    const keyOf = (node) => {
        const f = node.callFrame;
        return `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
    };
    const dt = profile.timeDeltas;
    profile.samples.forEach((id, i) => {
        const weight = dt[i] ?? 0;
        const key = keyOf(byId.get(id));
        self.set(key, (self.get(key) ?? 0) + weight);
        const seen = new Set();
        for (let at = id; at !== undefined; at = parent.get(at)) {
            const k = keyOf(byId.get(at));
            if (seen.has(k)) continue;
            seen.add(k);
            total.set(k, (total.get(k) ?? 0) + weight);
        }
    });
    const list = (map, n) =>
        [...map.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([k, v]) => `${(v / 1000).toFixed(1).padStart(8)} ms  ${k}`)
            .join('\n');
    writeFileSync(
        `${OUT}/profile-${label.replace(/\W+/g, '-')}.txt`,
        `SELF\n${list(self, 25)}\n\nTOTAL (inclusive)\n${list(total, 60)}\n`
    );
}

const paneBox = async () => {
    const b = await page.locator('.react-flow__pane').boundingBox();
    if (!b) throw new Error('no pane');
    return b;
};
/** Page position of the title of the first table that is wholly inside the pane. */
async function visibleTable(skip = 0) {
    const pane = await paneBox();
    const spots = await page.evaluate(
        ({ pane }) =>
            [...document.querySelectorAll('.react-flow__node-entity')]
                .map((el) => el.getBoundingClientRect())
                .filter(
                    (r) =>
                        r.left > pane.x + 20 &&
                        r.right < pane.x + pane.width - 20 &&
                        r.top > pane.y + 20 &&
                        r.bottom < pane.y + pane.height - 20 &&
                        r.width > 8
                )
                .map((r) => ({
                    x: r.left + r.width / 2,
                    y: r.top + Math.min(8, r.height / 6),
                })),
        { pane }
    );
    if (spots.length <= skip)
        throw new Error(
            `no visible table (${spots.length} found, wanted #${skip})`
        );
    return spots[skip];
}

// ------------------------------------------------------------------ browser

if (!process.env.SKIP_BUILD) {
    console.log('building...');
    execSync(
        `npx vite build --outDir ${DIST} --emptyOutDir${PROFILE ? ' --minify false' : ''}`,
        {
            stdio: 'ignore',
            env: { ...process.env, VITE_QUBDI_BACKEND_URL: '' },
        }
    );
}
const server = spawn(
    'npx',
    [
        'vite',
        'preview',
        '--outDir',
        DIST,
        '--port',
        String(PORT),
        '--strictPort',
    ],
    { stdio: 'ignore' }
);
process.on('exit', () => server.kill());
for (let i = 0; i < 40; i += 1) {
    const up = await fetch(BASE)
        .then((r) => r.ok)
        .catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({
    args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const problems = [];

async function freshPage() {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
        locale: 'en-US',
    });
    await context.addInitScript(RECORDER);
    page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
    });
    cdp = await context.newCDPSession(page);
    return context;
}

const menu = async (...path) => {
    await page.getByRole('menubar').getByText(path[0], { exact: true }).click();
    for (const label of path.slice(1)) {
        await page
            .getByRole('menuitem', { name: label, exact: true })
            .or(page.getByRole('menuitemradio', { name: label, exact: true }))
            .click();
    }
};

/** Time from a click to the first drawn table, and until the main thread is quiet. */
async function renderTimes(size, source, click) {
    const t = page.evaluate(() =>
        window.__perf.timeTo('click', () =>
            Boolean(document.querySelector('.react-flow__node-entity'))
        )
    );
    await click();
    await page.waitForURL(/\/diagrams\/.+/, { timeout: 120000 });
    const first = await t;
    await waitQuiet(700);
    const rec = await stopRecording();
    const lastEnd = Math.max(
        0,
        ...rec.longTasks.map((l) => l.start + l.duration - rec.t0)
    );
    return { first, lastEnd, rec };
}

async function loadFromSql(size) {
    const sql = makeSql(size);
    await page.goto(`${BASE}/`);
    await page.getByRole('radio', { name: /PostgreSQL/ }).click();
    await page
        .getByRole('dialog')
        .getByRole('tab', { name: 'SQL script' })
        .click();
    const tParse = Date.now();
    await profiled(`parse-${size}`, async () => {
        // set the value the way a paste does (Playwright's fill types the text
        // through the editing commands, which is slow in a big textarea)
        await page
            .getByRole('textbox', { name: 'SQL script' })
            .evaluate((el, text) => {
                Object.getOwnPropertyDescriptor(
                    HTMLTextAreaElement.prototype,
                    'value'
                ).set.call(el, text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }, sql);
        await page
            .getByText(new RegExp(`Found ${size} tables`))
            .first()
            .waitFor({ timeout: 240000 });
    });
    note(
        size,
        'sql',
        'parse in the dialog (paste to "Found")',
        Date.now() - tParse,
        'ms'
    );
    const build = page.getByRole('button', { name: 'Build from text' });
    return profiled(`load-${size}-sql`, () =>
        renderTimes(size, 'sql', async () => {
            const wait = page.evaluate(() => window.__perf.reset());
            await wait;
            await build.click();
        })
    );
}

async function loadFromJson(size, file) {
    // a blank diagram, then Import > Diagram file
    await page.goto(`${BASE}/`);
    await page.getByRole('radio', { name: /PostgreSQL/ }).click();
    await page.getByRole('button', { name: 'Blank diagram instead' }).click();
    await page.waitForURL(/\/diagrams\/.+/);
    await page.locator('.react-flow').waitFor();
    const before = page.url();
    await menu('Diagram', 'Import from', 'Diagram file (.json)');
    await page.locator('input[type=file]').setInputFiles(file);
    const button = page.getByRole('button', { name: 'Import', exact: true });
    await button.waitFor();
    await page.evaluate(() => window.__perf.reset());
    const t = page.evaluate(() =>
        window.__perf.timeTo('click', () =>
            Boolean(document.querySelector('.react-flow__node-entity'))
        )
    );
    await button.click();
    await page.waitForURL((u) => u.toString() !== before, { timeout: 120000 });
    const first = await t;
    await waitQuiet(700);
    const rec = await stopRecording();
    const lastEnd = Math.max(
        0,
        ...rec.longTasks.map((l) => l.start + l.duration - rec.t0)
    );
    return { first, lastEnd, rec };
}

async function heapMb() {
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    return usedSize / 1048576;
}

// ------------------------------------------------------------------ the measurements

const want = (step) =>
    !process.env.STEPS || process.env.STEPS.split(',').includes(step);
async function measureInteractions(size, source) {
    const at200 = size === 200;
    if (process.env.EXPERIMENT_CSS)
        await page.addStyleTag({ content: process.env.EXPERIMENT_CSS });
    const nodeCount = await page.locator('.react-flow__node-entity').count();
    note(size, source, 'tables drawn after load', nodeCount, '');
    note(size, source, 'JS heap after load', await heapMb(), 'MB');

    // select a table
    if (want('select')) {
        let ms = -1;
        for (let spotNo = 3; spotNo < 8 && ms < 0; spotNo += 1) {
            await page.mouse.move(5, 5);
            await page.mouse.click(5, 5);
            const spot = await visibleTable(spotNo);
            const t = page.evaluate(() =>
                window.__perf.timeTo(
                    'pointerdown',
                    () =>
                        Boolean(
                            document.querySelector('.react-flow__node.selected')
                        ),
                    3000
                )
            );
            await profiled(`select-${size}-${source}`, async () => {
                await page.mouse.click(spot.x, spot.y);
                await t;
            });
            ms = await t;
        }
        note(size, source, 'select a table', ms, 'ms', 200);
    }

    // drag a table: 60 moves
    if (want('drag')) {
        const spot = await visibleTable(5);
        await page.mouse.move(spot.x, spot.y);
        await page.mouse.down();
        await startRecording();
        await profiled(`drag-${size}-${source}`, async () => {
            for (let i = 1; i <= 60; i += 1)
                await page.mouse.move(spot.x + i * 3, spot.y + i * 2);
        });
        const rec = await stopRecording();
        await startRecording();
        await profiled(`drop-${size}-${source}`, async () => {
            await page.mouse.up();
            await pause(2500);
        });
        const frames = rec.frames.filter((f) => f > 0);
        note(size, source, 'drag frame p50', pct(frames, 0.5), 'ms');
        note(
            size,
            source,
            'drag frame p95',
            pct(frames, 0.95),
            'ms',
            at200 ? 50 : undefined
        );
        note(size, source, 'drag frame max', Math.max(...frames), 'ms');
        // the drop is one edit; the autosave follows a second later
        const after = await stopRecording();
        if (after.idb.length > 0) {
            // the diagram itself and its list entry: the slowest of the two
            note(
                size,
                source,
                'autosave: put() call (clone)',
                Math.max(...after.idb.map((w) => w.sync)),
                'ms'
            );
            note(
                size,
                source,
                'autosave: put to commit',
                Math.max(...after.idb.map((w) => w.total)),
                'ms'
            );
        } else note(size, source, 'autosave: writes seen', 0, '');
        note(
            size,
            source,
            'drop + autosave: longest long task',
            Math.max(0, ...after.longTasks.map((l) => l.duration)),
            'ms'
        );
        await waitQuiet(300);
    }

    // pan (wheel) and zoom (ctrl + wheel)
    if (want('panzoom')) {
        const pane = await paneBox();
        await page.mouse.move(
            pane.x + pane.width / 2,
            pane.y + pane.height / 2
        );
        await startRecording();
        await profiled(`pan-${size}-${source}`, async () => {
            for (let i = 0; i < 30; i += 1) await page.mouse.wheel(0, 40);
            await pause(300);
        });
        let rec = await stopRecording();
        note(
            size,
            source,
            'pan longest long task',
            Math.max(0, ...rec.longTasks.map((l) => l.duration)),
            'ms',
            at200 ? 200 : undefined
        );
        note(size, source, 'pan frame p95', pct(rec.frames, 0.95), 'ms');
        await page.keyboard.down('Control');
        await startRecording();
        await profiled(`zoom-${size}-${source}`, async () => {
            for (let i = 0; i < 30; i += 1)
                await page.mouse.wheel(0, i < 15 ? -60 : 60);
            await pause(300);
        });
        rec = await stopRecording();
        await page.keyboard.up('Control');
        note(
            size,
            source,
            'zoom longest long task',
            Math.max(0, ...rec.longTasks.map((l) => l.duration)),
            'ms',
            at200 ? 200 : undefined
        );
        note(size, source, 'zoom frame p95', pct(rec.frames, 0.95), 'ms');
        await page.keyboard.press('ControlOrMeta+0');
        await pause(800);
        await waitQuiet(300);
    }

    // type in the table name (edit card)
    if (want('type')) {
        // zoom in a little so a table is easy to hit, then double-click it
        const spot = await visibleTable(8);
        await page.mouse.dblclick(spot.x, spot.y);
        const name = page.getByRole('textbox', { name: 'Table name' });
        await name.waitFor();
        await name.click();
        await page.keyboard.press('ControlOrMeta+a');
        await startRecording();
        await profiled(`type-${size}-${source}`, async () => {
            for (const ch of 'customer_accounts') await page.keyboard.type(ch);
            await pause(200);
        });
        const rec = await stopRecording();
        const keys = rec.events.filter(
            (e) =>
                e.name === 'keydown' ||
                e.name === 'keypress' ||
                e.name === 'input'
        );
        note(
            size,
            source,
            'typing: slowest key to paint',
            Math.max(0, ...keys.map((e) => e.duration)),
            'ms',
            100
        );
        note(
            size,
            source,
            'typing: longest long task',
            Math.max(0, ...rec.longTasks.map((l) => l.duration)),
            'ms'
        );
        await page.keyboard.press('Escape');
        await pause(200);
    }

    // add a table, undo, redo
    if (want('undo')) {
        await page.mouse.click(5, 5).catch(() => undefined);
        const add = page.getByRole('button', { name: 'Add table' }).first();
        // from the input event to the next painted frame (the commit is synchronous)
        const timed = async (kind, press, label) => {
            const t = page.evaluate(
                (k) => window.__perf.timeTo(k, () => true),
                kind
            );
            await profiled(`${label}-${size}-${source}`, async () => {
                await press();
                await t;
            });
            note(size, source, label, await t, 'ms', 300);
            await pause(300);
        };
        await timed('click', () => add.click(), 'add table (click to paint)');
        const key = (combo) => () => page.keyboard.press(combo);
        await timed('keydown', key('ControlOrMeta+z'), 'undo add table');
        await timed('keydown', key('ControlOrMeta+Shift+z'), 'redo add table');
        await timed('keydown', key('ControlOrMeta+z'), 'undo again');
    }

    // delete selected tables (rubber band over the left part of the canvas)
    if (want('delete')) {
        await page.keyboard.press('ControlOrMeta+0');
        await pause(800);
        await waitQuiet(300);
        const pane = await paneBox();
        await page.keyboard.down('Shift');
        await page.mouse.move(pane.x + 2, pane.y + 2);
        await page.mouse.down();
        await page.mouse.move(
            pane.x + pane.width * (size > 200 ? 0.35 : 0.55),
            pane.y + pane.height - 3,
            { steps: 8 }
        );
        await page.mouse.up();
        await page.keyboard.up('Shift');
        await pause(300);
        const selected = await page.evaluate(
            () =>
                document.querySelectorAll('.react-flow__node-entity.selected')
                    .length
        );
        if (selected > 1) {
            const total = await page.evaluate(
                () =>
                    document.querySelectorAll('.react-flow__node-entity').length
            );
            await startRecording();
            const t = page.evaluate(
                (n) =>
                    window.__perf.timeTo(
                        'keydown',
                        () =>
                            document.querySelectorAll(
                                '.react-flow__node-entity'
                            ).length <= n
                    ),
                total - selected
            );
            await profiled(`delete-${size}-${source}`, async () => {
                await page.keyboard.press('Delete');
                await t;
            });
            const ms = await t;
            note(
                size,
                source,
                `delete ${selected} selected tables`,
                ms,
                'ms',
                selected >= 100 ? 500 : undefined
            );
            await waitQuiet(300);
            const rec = await stopRecording();
            note(
                size,
                source,
                'delete: longest long task',
                Math.max(0, ...rec.longTasks.map((l) => l.duration)),
                'ms'
            );
            const t2 = page.evaluate(
                (n) =>
                    window.__perf.timeTo(
                        'keydown',
                        () =>
                            document.querySelectorAll(
                                '.react-flow__node-entity'
                            ).length >= n
                    ),
                total
            );
            await page.keyboard.press('ControlOrMeta+z');
            note(
                size,
                source,
                `undo the delete of ${selected}`,
                await t2,
                'ms'
            );
            await waitQuiet(300);
        } else note(size, source, 'delete: tables selected', selected, '');
    }

    // export SQL
    if (want('export')) {
        await page
            .getByRole('menubar')
            .getByText('Diagram', { exact: true })
            .click();
        await page
            .getByRole('menuitem', { name: 'Export SQL for', exact: true })
            .click();
        const t0 = Date.now();
        await startRecording();
        await page
            .getByRole('menuitem', { name: 'PostgreSQL', exact: true })
            .click();
        const box = page.getByRole('textbox', { name: 'Generated script' });
        await box.waitFor();
        await page.waitForFunction(
            () =>
                document.querySelector(
                    'textarea[aria-label="Generated script"]'
                )?.value
        );
        note(size, source, 'export SQL (click to text)', Date.now() - t0, 'ms');
        const rec = await stopRecording();
        note(
            size,
            source,
            'export SQL: longest long task',
            Math.max(0, ...rec.longTasks.map((l) => l.duration)),
            'ms'
        );
        await page.keyboard.press('Escape');
        await pause(300);
    }

    // DBML section
    if (want('dbml')) {
        await startRecording();
        const t0 = Date.now();
        await page.getByRole('button', { name: 'DBML', exact: true }).click();
        await page
            .getByText(/Table "public"\."t_\d+"/)
            .first()
            .waitFor({ timeout: 60000 });
        note(
            size,
            source,
            'switch to DBML (click to text)',
            Date.now() - t0,
            'ms'
        );
        const rec = await stopRecording();
        note(
            size,
            source,
            'DBML: longest long task',
            Math.max(0, ...rec.longTasks.map((l) => l.duration)),
            'ms'
        );
        await page.getByRole('button', { name: 'Tables', exact: true }).click();
        await pause(300);
    }
}

// ------------------------------------------------------------------ run

for (const size of SIZES) {
    console.log(`\n== ${size} tables`);
    let jsonText;
    for (const source of SOURCES) {
        const context = await freshPage();
        try {
            let load;
            if (source === 'sql') {
                load = await loadFromSql(size);
                // export the diagram file once for the JSON run
                if (SOURCES.includes('json')) {
                    await page
                        .locator('.react-flow__node-entity')
                        .first()
                        .waitFor();
                    await menu('Diagram', 'Save as', 'Diagram file (.json)');
                    const [download] = await Promise.all([
                        page.waitForEvent('download'),
                        page
                            .getByRole('button', {
                                name: 'Download',
                                exact: true,
                            })
                            .click(),
                    ]);
                    await download.saveAs(`${OUT}/diagram-${size}.json`);
                    jsonText = withAreas(
                        readFileSync(`${OUT}/diagram-${size}.json`, 'utf8'),
                        size
                    );
                    writeFileSync(`${OUT}/diagram-${size}.json`, jsonText);
                    await page.keyboard.press('Escape');
                }
            } else {
                if (!jsonText) {
                    jsonText = withAreas(
                        readFileSync(`${OUT}/diagram-${size}.json`, 'utf8'),
                        size
                    );
                }
                load = await loadFromJson(size, `${OUT}/diagram-${size}.json`);
            }
            note(
                size,
                source,
                'first table drawn after import',
                load.first,
                'ms',
                size === 200 ? 2000 : undefined
            );
            note(
                size,
                source,
                'interactive after import (last long task)',
                load.lastEnd,
                'ms',
                size === 200 ? 2000 : undefined
            );
            note(
                size,
                source,
                'longest long task at load',
                Math.max(0, ...load.rec.longTasks.map((l) => l.duration)),
                'ms'
            );
            await page.screenshot({
                path: `${OUT}/loaded-${size}-${source}.png`,
            });
            if (!process.env.LOADONLY) await measureInteractions(size, source);
        } catch (error) {
            console.log(
                `FAILED ${size} ${source}: ${error.message.split('\n')[0]}`
            );
            results.push({
                size,
                source,
                metric: 'ERROR',
                value: error.message.split('\n')[0],
                unit: '',
            });
            await page
                .screenshot({ path: `${OUT}/FAIL-${size}-${source}.png` })
                .catch(() => undefined);
        }
        await context.close();
    }
}

await browser.close();

// ------------------------------------------------------------------ report

console.log('\n==== results');
const metrics = [...new Set(results.map((r) => r.metric))];
const cols = [];
for (const size of SIZES)
    for (const source of SOURCES) cols.push(`${size}/${source}`);
const lines = [['metric', ...cols, 'limit@200'].join(' | ')];
for (const metric of metrics) {
    const cells = cols.map((c) => {
        const [size, source] = c.split('/');
        const r = results.find(
            (x) =>
                x.metric === metric &&
                String(x.size) === size &&
                x.source === source
        );
        return r === undefined
            ? '-'
            : typeof r.value === 'number'
              ? `${Math.round(r.value * (r.unit === 'MB' ? 10 : 1)) / (r.unit === 'MB' ? 10 : 1)}`
              : r.value;
    });
    const limit =
        results.find((x) => x.metric === metric && x.limit !== undefined)
            ?.limit ?? '';
    lines.push([metric, ...cells, limit].join(' | '));
}
console.log(lines.join('\n'));
writeFileSync(`${OUT}/perf-results.json`, JSON.stringify(results, null, 2));
writeFileSync(`${OUT}/perf-table.txt`, lines.join('\n'));

const failures = results.filter(
    (r) =>
        r.limit !== undefined &&
        typeof r.value === 'number' &&
        r.value > r.limit
);
console.log('\n==== over the limit');
for (const f of failures)
    console.log(
        `  ${f.size}/${f.source} ${f.metric}: ${Math.round(f.value)} > ${f.limit}`
    );
if (failures.length === 0) console.log('  none');
if (problems.length > 0) {
    console.log('\n==== page problems');
    for (const p of [...new Set(problems)].slice(0, 10)) console.log(`  ${p}`);
}
server.kill();
process.exit(0);
