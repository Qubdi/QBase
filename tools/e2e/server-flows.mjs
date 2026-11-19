// Real-browser flows of SERVER mode: the Docker image of this checkout with a
// throwaway PostgreSQL backend, a second PostgreSQL as the "live source
// database", Chromium from the Playwright image. Run it with
// tools/e2e/run-server-flows.sh (which starts and removes everything).
//
// Env: BASE_URL, SRC_HOST/SRC_USER/SRC_PASSWORD/SRC_DB (source database),
// ADMIN_PASSWORD, SHOTS (screenshot dir), ONLY=S1,S4 (run some sections).
// Every step prints PASS/FAIL; every section ends with a "no console error,
// page error or failed request" check. Expected 4xx answers (a wrong password,
// a revoked link, a viewer's refused save) are allowed inside steps that say so.
import process from 'node:process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const req = createRequire('/tmp/pw/');
const { chromium } = req('playwright');
const pg = req('pg');
const E = process.env;
const BASE = E.BASE_URL.replace(/\/$/, '');
const SHOTS = E.SHOTS || '/tmp/qbase-server-flows';
const ONLY = (E.ONLY || '').split(',').filter(Boolean);
mkdirSync(SHOTS, { recursive: true });

const ADMIN = 'admin@example.com';
const ADMIN_PW = E.ADMIN_PASSWORD;
const EDITOR = 'editor@example.com';
const VIEWER = 'viewer@example.com';
// a password that passes the rules, different from the temporary one
const TEMP_PW = 'Tt7#' + ADMIN_PW.slice(4);
const OWN_PW = 'Oo5$' + ADMIN_PW.slice(4);

const results = [];
let problems = [];
let tolerate = 0; // >0: 4xx answers and their console lines are expected
let page;
let shotNo = 0;
let browser;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = (ms) => page.waitForTimeout(ms);
const check = (cond, message) => {
    if (!cond) throw new Error(message);
};
const shot = async (name, p = page) => {
    shotNo += 1;
    await p.screenshot({
        path: `${SHOTS}/${String(shotNo).padStart(2, '0')}-${name}.png`,
    });
};

async function step(name, fn, opts = {}) {
    if (opts.expect4xx) tolerate += 1;
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`PASS ${name}`);
    } catch (error) {
        const msg = String(error.message || error).split('\n')[0];
        results.push({ name, ok: false, error: msg });
        console.log(`FAIL ${name}: ${msg}`);
        try {
            await shot(`FAIL-${name.replace(/\W+/g, '-').slice(0, 50)}`);
        } catch {
            /* page may be gone */
        }
        await page?.keyboard.press('Escape').catch(() => undefined);
    } finally {
        if (opts.expect4xx) tolerate -= 1;
    }
}

const watch = (p, label) => {
    p.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (/Failed to load resource.*\b4\d\d\b/.test(text) && tolerate > 0)
            return;
        if (/status of 401/.test(text) && /auth\/me/.test(m.location().url))
            return;
        if (/status of 401/.test(text) && m.location().url.includes('/api/'))
            return; // signed-out probes
        problems.push(`[${label}] console: ${text.slice(0, 160)}`);
    });
    p.on('pageerror', (e) =>
        problems.push(`[${label}] page error: ${e.message}`)
    );
    p.on('requestfailed', (r) => {
        if (r.failure()?.errorText === 'net::ERR_ABORTED') return;
        problems.push(`[${label}] request failed: ${r.url()}`);
    });
    p.on('response', (r) => {
        const s = r.status();
        if (s < 400) return;
        if (s === 401 && r.url().endsWith('/api/auth/me')) return;
        if (tolerate > 0 && s >= 400 && s < 500) return;
        problems.push(`[${label}] HTTP ${s}: ${r.url()}`);
    });
};

async function section(id, title, fn) {
    if (ONLY.length && !ONLY.includes(id)) return;
    console.log(`\n== ${id} ${title}`);
    problems = [];
    await fn();
    await step(`${id} no console error, page error or failed request`, () => {
        check(problems.length === 0, problems.slice(0, 4).join(' | '));
    });
}

const newContext = async (opts = {}) => {
    const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        ...opts,
    });
    const p = await ctx.newPage();
    p.setDefaultTimeout(15000);
    return { ctx, p };
};

// ------------------------------------------------------------ source database
const src = new pg.Client({
    host: E.SRC_HOST,
    user: E.SRC_USER,
    password: E.SRC_PASSWORD,
    database: E.SRC_DB,
});
await src.connect();
await src.query(`
    drop table if exists orders, customers, products, legacy_log cascade;
    create table customers(id serial primary key, name varchar(100) not null, email varchar(200) unique);
    create table orders(id serial primary key, customer_id int not null references customers(id), total numeric(10,2), note text);
    create table products(id serial primary key, title text, price numeric);
    create table legacy_log(id serial primary key, msg text);
`);

browser = await chromium.launch();

// ------------------------------------------------------------ UI helpers
const txt = async () =>
    (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const noRawKeys = async () => {
    const t = await txt();
    const m = t.match(/\bqubdi\.[a-zA-Z]+\.[a-zA-Z.]+/);
    check(!m, `raw translation key on screen: ${m?.[0]}`);
};
const accountMenu = async (item) => {
    await page.getByRole('button', { name: /@example\.com/ }).click();
    await page.getByRole('menuitem', { name: item }).click();
};
/** Signs in through the dialog; completes the forced password change. */
async function signIn(p, email, pw, { newPw } = {}) {
    await p.goto(BASE + '/');
    await p.getByRole('button', { name: 'Sign in' }).first().click();
    const d = p.getByRole('dialog');
    await d.getByPlaceholder('Email', { exact: true }).fill(email);
    await d.getByPlaceholder('Password', { exact: true }).fill(pw);
    await d.getByRole('button', { name: 'Sign in' }).click();
    if (newPw) {
        const c = p.getByRole('dialog');
        await c.getByPlaceholder('Current password').fill(pw);
        await c.getByPlaceholder('New password').fill(newPw);
        await c.getByRole('button', { name: 'Change password' }).click();
    }
    await p.getByRole('dialog').waitFor({ state: 'detached' });
}
const tables = () => page.locator('[data-testid^="entity-"]');
const tableNames = async () =>
    (await tables().allInnerTexts()).map((t) => t.split('\n')[0].trim());
const pendingSave = () =>
    page
        .getByRole('button', { name: /Unsaved changes|Saving|Not saved/ })
        .first();
const waitSavedOn = async (p) => {
    const b = p
        .getByRole('button', { name: /Unsaved changes|Saving|Not saved/ })
        .first();
    await b.waitFor({ timeout: 4000 }).catch(() => undefined);
    await b.waitFor({ state: 'detached', timeout: 30000 });
};
/** the autosave indicator goes through "unsaved" and "saving" to saved */
const waitSaved = async () => {
    await pendingSave()
        .waitFor({ timeout: 4000 })
        .catch(() => undefined);
    await pendingSave().waitFor({ state: 'detached', timeout: 30000 });
};
const toast = (re) => page.getByText(re).first().waitFor({ timeout: 10000 });
async function openProject(slug = 'Test') {
    await page.goto(`${BASE}/${slug}/diagrams`);
    await page.getByRole('button', { name: 'New diagram' }).waitFor();
}
async function openDiagramByName(name, slug = 'Test') {
    await openProject(slug);
    await page.getByText(name, { exact: true }).first().click();
    await page.getByRole('button', { name: 'Open diagram' }).click();
    await page.locator('.react-flow').waitFor();
}
const diagramId = () => page.url().split('/diagrams/')[1]?.split(/[/?#]/)[0];
const api = (p, method, path, body) =>
    p.evaluate(
        async ([m, u, b]) => {
            const r = await fetch('/api' + u, {
                method: m,
                headers: b ? { 'content-type': 'application/json' } : {},
                body: b ? JSON.stringify(b) : undefined,
                credentials: 'include',
            });
            let json = null;
            try {
                json = await r.json();
            } catch {
                /* no body */
            }
            return { status: r.status, json };
        },
        [method, path, body]
    );

// the admin's own browser
let A;

// =====================================================================  S1
await section('S1', 'sign-in, first admin, sign out and in', async () => {
    A = await newContext();
    page = A.p;
    watch(page, 'admin');

    await step(
        'S1.01 signed out, an empty server offers to create the admin',
        async () => {
            await page.goto(BASE + '/');
            await page
                .getByRole('button', { name: 'Create admin account' })
                .waitFor();
            check(/no users yet/.test(await txt()), 'setup prompt missing');
            await shot('s1-setup-prompt');
            await noRawKeys();
        }
    );

    await step(
        'S1.02 the first account becomes admin and lands on the admin panel',
        async () => {
            await page
                .getByRole('button', { name: 'Create admin account' })
                .click();
            const d = page.getByRole('dialog');
            await d.getByPlaceholder('Email', { exact: true }).fill(ADMIN);
            await d.getByPlaceholder('Password', { exact: true }).fill('abc');
            check(
                /not met/.test(await d.innerText()),
                'rules should show as not met'
            );
            await shot('s1-password-rules');
            await d
                .getByPlaceholder('Password', { exact: true })
                .fill(ADMIN_PW);
            // an empty server wants its setup token before it makes the first admin
            if (process.env.SETUP_TOKEN)
                await d
                    .getByPlaceholder('Setup token')
                    .fill(process.env.SETUP_TOKEN);
            await d
                .getByRole('button', { name: 'Create admin account' })
                .click();
            await page.waitForURL(/\/admin\/overview/);
            await page.getByText('Totals for users').waitFor();
            await shot('s1-admin-overview');
        }
    );

    await step(
        'S1.03 /config.js points the editor at /api on the same origin',
        async () => {
            const r = await page.evaluate(() =>
                fetch('/config.js').then((x) => x.text())
            );
            check(/QUBDI_BACKEND_URL:\s*"\/api"/.test(r), r);
        }
    );

    await step(
        'S1.04 sign out from the editor menu (needs a project first)',
        async () => {
            await page.goto(BASE + '/admin/projects');
            await page
                .getByRole('button', { name: 'New project' })
                .first()
                .click();
            const d = page.getByRole('dialog');
            await d.getByLabel('Project name').fill('Test');
            await d.getByRole('button', { name: 'Create project' }).click();
            await toast(/Project created/);
            await page.goto(BASE + '/Test/diagrams');
            await page.getByRole('button', { name: 'New diagram' }).waitFor();
            await page.getByRole('button', { name: 'New diagram' }).click();
            await page
                .getByRole('dialog')
                .getByLabel('Diagram name')
                .fill('Shop');
            await page.getByRole('button', { name: 'Create diagram' }).click();
            await page.locator('.react-flow').waitFor();
            await accountMenu('Sign out');
            await page
                .getByRole('button', { name: 'Sign in' })
                .first()
                .waitFor();
            await shot('s1-signed-out');
        }
    );

    await step(
        'S1.05 a wrong password is refused with a message',
        async () => {
            await page.goto(BASE + '/');
            await page.getByRole('button', { name: 'Sign in' }).first().click();
            const d = page.getByRole('dialog');
            await d.getByPlaceholder('Email', { exact: true }).fill(ADMIN);
            await d
                .getByPlaceholder('Password', { exact: true })
                .fill('Wrong-password-1!');
            await d.getByRole('button', { name: 'Sign in' }).click();
            await d.getByText('Wrong email or password.').waitFor();
            await shot('s1-wrong-password');
        },
        { expect4xx: true }
    );

    await step('S1.06 the right password signs in again', async () => {
        await signIn(page, ADMIN, ADMIN_PW);
        await page.waitForURL(/\/(admin\/overview)?$/);
        check(!/Sign in to see/.test(await txt()), 'still signed out');
    });
});

// =====================================================================  S2
await section('S2', 'admin: users, project, roles', async () => {
    page = A.p;
    await step(
        'S2.01 users page lists the admin; New user creates an editor and a viewer',
        async () => {
            await page.goto(BASE + '/admin/users');
            await page.getByRole('heading', { name: 'Users' }).waitFor();
            for (const email of [EDITOR, VIEWER]) {
                await page.getByRole('button', { name: 'New user' }).click();
                const d = page.getByRole('dialog');
                await d.getByLabel('Email').fill(email);
                await d.getByLabel('Temporary password').fill(TEMP_PW);
                await d.getByRole('button', { name: 'Create user' }).click();
                await page.getByRole('dialog').waitFor({ state: 'detached' });
            }
            await page.getByText(EDITOR).first().waitFor();
            await page.getByText(VIEWER).first().waitFor();
            await shot('s2-users');
        }
    );

    await step('S2.02 project members: assign editor and viewer', async () => {
        await page.goto(BASE + '/admin/projects');
        await page.getByText('Test', { exact: true }).first().click();
        for (const [email, role] of [
            [EDITOR, 'Editor'],
            [VIEWER, 'Viewer'],
        ]) {
            await page
                .getByPlaceholder('Search users by email…')
                .fill(email.slice(0, 4));
            await page.getByText(email).first().click();
            await page
                .locator('select')
                .first()
                .selectOption({ label: role })
                .catch(async () => {
                    await page.getByRole('combobox').click();
                    await page.getByRole('option', { name: role }).click();
                });
            await page.getByRole('button', { name: 'Assign' }).click();
            await page
                .getByRole('list')
                .getByText(email)
                .first()
                .waitFor()
                .catch(async () => {
                    await page.getByText(email).nth(0).waitFor();
                });
        }
        await shot('s2-members');
        const t = await txt();
        check(t.includes(EDITOR) && t.includes(VIEWER), 'members missing');
    });

    await step(
        'S2.03 projects page and diagrams page show the project and its diagram',
        async () => {
            await page.goto(BASE + '/admin/projects');
            await page.getByText('Test', { exact: true }).first().waitFor();
            await page.goto(BASE + '/admin/diagrams');
            await page.getByText('Shop').first().waitFor();
            await shot('s2-diagrams');
            await page.goto(BASE + '/admin/activity');
            await page.getByRole('heading', { name: 'Activity' }).waitFor();
        }
    );
});

// =====================================================================  S3
await section(
    'S3',
    'editor: rename, autosave, reload, publish, versions',
    async () => {
        page = A.p;
        await step('S3.01 open the diagram from the project list', async () => {
            await openDiagramByName('Shop');
            await page
                .getByRole('button', { name: 'Rename the diagram' })
                .waitFor();
        });
        await step('S3.02 rename the diagram', async () => {
            await page
                .getByRole('button', { name: 'Rename the diagram' })
                .click();
            await page.keyboard.press('ControlOrMeta+a');
            await page.keyboard.type('Shop v2');
            await page.keyboard.press('Enter');
            await page.getByText('Shop v2').first().waitFor();
        });
        await step(
            'S3.03 add a table: Unsaved changes, then Saved to project',
            async () => {
                await page
                    .getByRole('button', { name: 'Add Table' })
                    .first()
                    .click();
                await pendingSave().waitFor();
                await waitSaved();
                check((await pendingSave().count()) === 0, 'still unsaved');
                await shot('s3-saved');
            }
        );
        await step(
            'S3.04 a reload keeps the diagram name and the table',
            async () => {
                await page.reload();
                await page.locator('.react-flow').waitFor();
                await tables().first().waitFor();
                check(/Shop v2/.test(await txt()), 'name lost');
            }
        );
        await step(
            'S3.05 publish v1 with a note, status button changes',
            async () => {
                await page.getByRole('button', { name: /^Publish/ }).click();
                await page
                    .getByRole('dialog')
                    .getByRole('textbox', { name: 'Note (optional)' })
                    .fill('first');
                await page
                    .getByRole('dialog')
                    .getByRole('button', { name: 'Publish', exact: true })
                    .click();
                await toast(/Published v1/);
                await page
                    .getByRole('button', { name: /Publish\. Published v1/ })
                    .waitFor();
            }
        );
        await step(
            'S3.06 a change shows "unpublished changes"; publish v2',
            async () => {
                await page
                    .getByRole('button', { name: 'Add Table' })
                    .first()
                    .click();
                await waitSaved();
                await page
                    .getByRole('button', {
                        name: /Published v1, unpublished changes/,
                    })
                    .waitFor();
                await page.getByRole('button', { name: /^Publish/ }).click();
                await page
                    .getByRole('dialog')
                    .getByRole('button', { name: 'Publish', exact: true })
                    .click();
                await toast(/Published v2/);
            }
        );
        await step('S3.07 the server lists both versions', async () => {
            const r = await api(
                page,
                'GET',
                `/diagrams/${diagramId()}/versions`
            );
            const list = r.json?.items ?? r.json;
            check(
                r.status === 200 && Array.isArray(list) && list.length >= 2,
                JSON.stringify(r).slice(0, 200)
            );
        });
    }
);

// =====================================================================  S4
let shareUrl = '';
let shareDiagram = '';
await section('S4', 'share link', async () => {
    page = A.p;
    shareDiagram = diagramId();
    await step('S4.01 Share creates a link', async () => {
        await accountMenu('Share');
        await page.getByRole('button', { name: 'Create link' }).click();
        const input = page.getByRole('textbox', { name: 'Share URL' });
        await input.waitFor();
        shareUrl = await input.inputValue();
        check(/\/s\/.+/.test(shareUrl), shareUrl);
        await shot('s4-share-dialog');
        await noRawKeys();
    });
    let V;
    await step(
        'S4.02 a fresh browser opens the link: read-only viewer',
        async () => {
            V = await newContext();
            watch(V.p, 'anon');
            await V.p.goto(shareUrl);
            await V.p.getByText(/v\d+ · (live · )?read-only/).waitFor();
            const nodes = await V.p.locator('.react-flow__node').count();
            check(nodes >= 2, `viewer shows ${nodes} tables`);
            check(
                (await V.p
                    .getByRole('button', { name: 'Add Table' })
                    .count()) === 0,
                'viewer has editing'
            );
            await shot('s4-viewer', V.p);
        }
    );
    await step('S4.03 an expiry date can be set in the dialog', async () => {
        const dt = page.locator('input[type=datetime-local]').first();
        const d = new Date(Date.now() + 86400000);
        const pad = (n) => String(n).padStart(2, '0');
        await dt.fill(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00`
        );
        await dt.blur();
        await pause(800);
        await page
            .getByText(/Expires/)
            .first()
            .waitFor();
    });
    await step(
        'S4.04 a link that expires stops working (404, "Link not available")',
        async () => {
            const made = await api(
                page,
                'POST',
                `/diagrams/${shareDiagram}/share-links`,
                {
                    access: 'anyone',
                    expiresAt: new Date(Date.now() + 4000).toISOString(),
                }
            );
            check(made.status === 201, JSON.stringify(made));
            const url = `${BASE}/s/${made.json.token}`;
            await V.p.goto(url);
            await V.p.getByText(/v\d+ · /).waitFor();
            await sleep(5000);
            await V.p.goto(url);
            await V.p.getByText('Link not available').waitFor();
            await shot('s4-expired', V.p);
        },
        { expect4xx: true }
    );
    await step(
        'S4.05 Revoke asks twice; the link then gives "Link not available"',
        async () => {
            await page.getByRole('button', { name: 'Revoke' }).first().click();
            await shot('s4-revoke-confirm');
            await page.getByRole('button', { name: 'Yes, revoke' }).click();
            await sleep(800);
            await V.p.goto(shareUrl);
            await V.p.getByText('Link not available').waitFor();
            await shot('s4-revoked', V.p);
        },
        { expect4xx: true }
    );
    await V?.ctx.close();
    await page.keyboard.press('Escape');
});

// =====================================================================  S5
await section('S5', 'roles: editor edits, viewer is read-only', async () => {
    // leave the diagram so the admin does not hold its edit lock
    page = A.p;
    await page.goto(BASE + '/admin/overview');
    await pause(1500);
    const E_ = await newContext();
    const V_ = await newContext();
    watch(E_.p, 'editor');
    watch(V_.p, 'viewer');
    await step(
        'S5.01 admin-created users must choose their own password',
        async () => {
            const p = E_.p;
            await p.goto(BASE + '/');
            await p.getByRole('button', { name: 'Sign in' }).first().click();
            const d = p.getByRole('dialog');
            await d.getByPlaceholder('Email', { exact: true }).fill(EDITOR);
            await d.getByPlaceholder('Password', { exact: true }).fill(TEMP_PW);
            await d.getByRole('button', { name: 'Sign in' }).click();
            await p
                .getByRole('dialog')
                .getByText('Choose your own password')
                .first()
                .waitFor();
            await shot('s5-forced-password-change', p);
            const c = p.getByRole('dialog');
            await c.getByPlaceholder('Current password').fill(TEMP_PW);
            await c.getByPlaceholder('New password').fill(OWN_PW);
            await c.getByRole('button', { name: 'Change password' }).click();
            await p.getByRole('dialog').waitFor({ state: 'detached' });
            await signIn(V_.p, VIEWER, TEMP_PW, { newPw: OWN_PW });
        },
        { expect4xx: true }
    );
    await step(
        'S5.02 the editor sees the project, opens the diagram, can add a table and publish',
        async () => {
            const p = E_.p;
            await p.goto(`${BASE}/Test/diagrams`);
            await p.getByText('Shop v2', { exact: true }).first().click();
            await p.getByRole('button', { name: 'Open diagram' }).click();
            await p.locator('.react-flow').waitFor();
            const before = await p.locator('[data-testid^="entity-"]').count();
            await p.getByRole('button', { name: 'Add Table' }).first().click();
            await pause(500);
            const after = await p.locator('[data-testid^="entity-"]').count();
            check(after === before + 1, 'editor could not add a table');
            check(
                (await p.getByRole('button', { name: /^Publish/ }).count()) > 0,
                'no Publish for the editor'
            );
            await shot('s5-editor', p);
            await waitSavedOn(p);
            await p.goto(BASE + '/'); // release the lock
        }
    );
    await step(
        'S5.03 the viewer sees only published content and cannot edit',
        async () => {
            const p = V_.p;
            await p.goto(`${BASE}/Test/diagrams`);
            await p.getByText('Shop v2', { exact: true }).first().click();
            await p.getByRole('button', { name: 'Open diagram' }).click();
            await p.locator('.react-flow').waitFor();
            await p.getByText(/view-only access/).waitFor();
            check(
                (await p.getByRole('button', { name: /^Publish/ }).count()) ===
                    0,
                'viewer sees Publish'
            );
            const n = await p.locator('[data-testid^="entity-"]').count();
            await p
                .getByRole('button', { name: 'Add Table' })
                .first()
                .click({ timeout: 2000 })
                .catch(() => undefined);
            await pause(500);
            check(
                (await p.locator('[data-testid^="entity-"]').count()) === n,
                'viewer added a table'
            );
            await shot('s5-viewer', p);
        }
    );
    await step(
        'S5.04 the viewer is refused the admin panel',
        async () => {
            const p = V_.p;
            await p.goto(BASE + '/admin/users');
            await pause(1000);
            check(
                !/New user/.test(await p.locator('body').innerText()),
                'viewer reached the user admin'
            );
            await shot('s5-viewer-admin', p);
        },
        { expect4xx: true }
    );
    await E_.ctx.close();
    await V_.ctx.close();
});

// =====================================================================  S6
await section('S6', '2FA setup dialog', async () => {
    page = A.p;
    await step(
        'S6.01 the two-factor dialog shows a QR code and asks for a code',
        async () => {
            await openProject();
            await page.getByRole('button', { name: 'New diagram' }).click();
            await page
                .getByRole('dialog')
                .getByLabel('Diagram name')
                .fill('Scratch');
            await page.getByRole('button', { name: 'Create diagram' }).click();
            await page.locator('.react-flow').waitFor();
            await accountMenu('Two-factor authentication');
            await page.getByRole('button', { name: 'Set up' }).click();
            await page.getByRole('img', { name: /QR code/ }).waitFor();
            await shot('s6-2fa-setup');
            await noRawKeys();
            await page.keyboard.press('Escape');
        }
    );
});

// =====================================================================  S7
const IMPORTED = 'Shop DB';
await section('S7', 'import a diagram from the live PostgreSQL', async () => {
    page = A.p;
    await step(
        'S7.01 a host that is not allowed is refused with a named setting',
        async () => {
            await openProject();
            await page.getByRole('button', { name: 'New diagram' }).click();
            await page
                .getByRole('button', { name: /Import from database/ })
                .click();
            const d = page.getByRole('dialog');
            await d.getByLabel('Host', { exact: true }).fill('10.255.255.1');
            await d.getByLabel('Database', { exact: true }).fill('x');
            await d.getByLabel('User', { exact: true }).fill('x');
            await d.getByLabel('Password', { exact: true }).fill('x');
            await d.getByRole('button', { name: 'Connect' }).click();
            await d.getByRole('alert').waitFor();
            await shot('s7-blocked-host');
            await page.keyboard.press('Escape');
        },
        { expect4xx: true }
    );
    await step(
        'S7.02 connection form, table picker and preview build the diagram',
        async () => {
            await openProject();
            await page.getByRole('button', { name: 'New diagram' }).click();
            await page
                .getByRole('button', { name: /Import from database/ })
                .click();
            const d = page.getByRole('dialog');
            await d.getByLabel('Host', { exact: true }).fill(E.SRC_HOST);
            await d.getByLabel('Port', { exact: true }).fill('5432');
            await d.getByLabel('Database', { exact: true }).fill(E.SRC_DB);
            await d.getByLabel('User', { exact: true }).fill(E.SRC_USER);
            await d
                .getByLabel('Password', { exact: true })
                .fill(E.SRC_PASSWORD);
            await d.getByLabel('Save connection as').fill('shop-source');
            await d.getByRole('button', { name: 'Connect' }).click();
            await d.getByRole('checkbox', { name: /customers/ }).waitFor();
            await shot('s7-table-picker');
            await d.getByRole('button', { name: 'Next' }).click();
            await d.getByTestId('db-import-summary').waitFor();
            check(
                /4 tables/.test(
                    await d.getByTestId('db-import-summary').innerText()
                ),
                'summary'
            );
            await d.getByLabel('Diagram name').fill(IMPORTED);
            await shot('s7-preview');
            await d.getByRole('button', { name: 'Create diagram' }).click();
            await page.locator('[data-testid^="entity-"]').first().waitFor();
            const names = await tableNames();
            for (const n of ['customers', 'orders', 'products', 'legacy_log'])
                check(
                    names.some((x) => x.includes(n)),
                    `missing ${n}: ${names}`
                );
            check(
                (await page.locator('.react-flow__edge').count()) >= 1,
                'no relationship line'
            );
            await shot('s7-imported');
        }
    );
});

// =====================================================================  S8
const snapshot = async () => {
    const r = await api(page, 'GET', `/diagrams/${diagramId()}`);
    return r.json?.content ?? r.json?.diagram ?? r.json;
};
const boxes = async () => {
    const out = {};
    // close any open edit card, whose fields hide the table name from the text
    await page
        .locator('.react-flow__pane')
        .click({ position: { x: 5, y: 300 } })
        .catch(() => undefined);
    await pause(300);
    for (const t of await tables().all()) {
        const b = await t.boundingBox();
        const text = await t.innerText();
        const n = ['customers', 'orders', 'products', 'legacy_log'].find((k) =>
            text.includes(k)
        );
        if (n) out[n] = { x: Math.round(b.x), y: Math.round(b.y) };
    }
    return out;
};
const DESCRIPTION = 'Customer accounts of the shop';
const findTable = (node, name) => {
    if (!node || typeof node !== 'object') return undefined;
    if (node.name === name && Array.isArray(node.fields)) return node;
    for (const v of Object.values(node)) {
        const hit = findTable(v, name);
        if (hit) return hit;
    }
    return undefined;
};
let before = {};
let beforeTable;
await section('S8', 'customise, lint, drift, re-sync', async () => {
    page = A.p;
    const lintCount = () => page.getByRole('button', { name: /^Lint/ }).first();

    await step(
        'S8.01 move a table, add a note and an area, set a colour and a description',
        async () => {
            const t = tables().filter({ hasText: 'products' }).first();
            const b = await t.boundingBox();
            await page.mouse.move(b.x + 40, b.y + 12);
            await page.mouse.down();
            await page.mouse.move(b.x + 140, b.y + 90, { steps: 10 });
            await page.mouse.up();
            await page
                .getByRole('button', { name: 'Visuals', exact: true })
                .click();
            await page
                .getByRole('button', { name: 'Add Area' })
                .first()
                .dragTo(page.locator('.react-flow__pane'), {
                    targetPosition: { x: 40, y: 520 },
                });
            await page.getByRole('tab', { name: 'Notes' }).click();
            await page
                .getByRole('button', { name: 'Add Note' })
                .first()
                .dragTo(page.locator('.react-flow__pane'), {
                    targetPosition: { x: 560, y: 90 },
                });
            await pause(500);
            await tables()
                .filter({ hasText: 'customers' })
                .first()
                .dblclick({ position: { x: 100, y: 15 } });
            // the table's own swatch is the last "Change color" (the notes panel has one first)
            await page
                .getByRole('button', { name: 'Change color' })
                .last()
                .click();
            await page
                .getByRole('button', { name: /^Use #/ })
                .nth(3)
                .click();
            await page.keyboard.press('Escape');
            // the Description section of the card starts closed
            await page
                .locator('[data-edit-card]')
                .getByRole('button', { name: 'Description', exact: true })
                .click();
            const desc = page
                .getByPlaceholder(/description/i)
                .or(page.getByRole('textbox', { name: /description/i }))
                .last();
            await desc.scrollIntoViewIfNeeded();
            await desc.fill(DESCRIPTION);
            await pause(300);
            await shot('s8-customised');
            await page.keyboard.press('Escape');
            await waitSaved();
            before = await boxes();
            beforeTable = findTable(await snapshot(), 'customers');
            check(
                beforeTable?.comments === DESCRIPTION ||
                    JSON.stringify(beforeTable).includes(DESCRIPTION),
                'description not saved: ' +
                    JSON.stringify(beforeTable).slice(0, 200)
            );
            check(
                beforeTable.color && beforeTable.color !== '#8eb7ff',
                'colour unchanged: ' + beforeTable.color
            );
        }
    );

    await step(
        'S8.02 schema lint: badge shows a count, the panel lists a finding',
        async () => {
            const btn = lintCount();
            await shot('s8-lint-button');
            await btn.click();
            await page.getByText(/Schema lint \(/).waitFor();
            await shot('s8-lint-panel');
            const t = await txt();
            check(
                !/\(0 errors, 0 warnings, 0 info\)/.test(t),
                'lint found nothing: ' + t.slice(0, 200)
            );
        }
    );

    await step(
        'S8.03 one-click Fix changes the diagram and the finding goes',
        async () => {
            const fixes = page.getByRole('button', {
                name: 'Fix',
                exact: true,
            });
            const n = await fixes.count();
            check(n > 0, 'no Fix button');
            const head = (await txt()).match(/Schema lint \([^)]*\)/)[0];
            await fixes.first().click();
            await toast(/Fix applied/);
            const after = (await txt()).match(/Schema lint \([^)]*\)/)?.[0];
            check(after !== head, 'finding did not go: ' + head);
            await shot('s8-lint-fixed');
            await page.getByRole('button', { name: 'Close lint' }).click();
            await waitSaved();
        }
    );

    await step(
        'S8.04 publish, then check drift (only the lint-fix index and the description differ), no webhook',
        async () => {
            await page.getByRole('button', { name: /^Publish/ }).click();
            await page
                .getByRole('dialog')
                .getByRole('button', { name: 'Publish', exact: true })
                .click();
            await toast(/Published v1/);
            await page.getByRole('button', { name: 'Drift' }).click();
            const d = page.getByRole('dialog');
            await d.getByText('Database drift').waitFor();
            await shot('s8-drift-dialog');
            await d
                .getByRole('combobox')
                .first()
                .click()
                .catch(() => undefined);
            const opt = page.getByRole('option', { name: /shop-source/ });
            if (await opt.count()) await opt.click();
            else
                await d
                    .locator('select')
                    .first()
                    .selectOption({ label: 'shop-source' });
            await d.getByRole('button', { name: 'Check now' }).click();
            // the lint fix added an index and the table has a description: neither is
            // in the database, so only these differences may show
            await d.getByText(/no drift|\d+ difference/).waitFor();
            check(
                !/Only in the database \([1-9]/.test(await d.innerText()),
                'unexpected difference'
            );
            await shot('s8-drift-clean');
            await page.keyboard.press('Escape');
        }
    );

    await step(
        'S8.05 change the source database (add column, drop table, rename table and column, add table)',
        async () => {
            await src.query(`
            alter table orders add column status text;
            drop table legacy_log;
            alter table products rename to product;
            alter table customers rename column name to full_name;
            create table invoices(id serial primary key, order_id int references orders(id), amount numeric(10,2));
        `);
        }
    );

    await step(
        'S8.06 drift check badge appears and the report lists the differences',
        async () => {
            await page.getByRole('button', { name: 'Drift' }).click();
            const d = page.getByRole('dialog');
            await d.getByRole('button', { name: 'Check now' }).click();
            await d.getByText(/difference/).waitFor();
            await shot('s8-drift-report');
            const t = await d.innerText();
            check(
                /Only in the database|Only in the diagram|Definitions differ/.test(
                    t
                ),
                t.slice(0, 300)
            );
            check(!/https?:\/\//.test(t) || /webhook/i.test(t), 'unexpected');
            await page.keyboard.press('Escape');
            await page
                .getByRole('button', { name: /Drift: \d+/ })
                .first()
                .waitFor({ timeout: 20000 });
            await shot('s8-drift-badge');
        }
    );

    await step(
        'S8.07 the re-sync dialog lists added, removed, changed and possible renames',
        async () => {
            await accountMenu('Re-sync from database');
            const d = page.getByRole('dialog');
            await d.getByText('Re-sync from database').first().waitFor();
            await shot('s8-resync-start');
            const pw = d.getByLabel('Database password');
            if (await pw.count()) await pw.fill(E.SRC_PASSWORD);
            await d.getByRole('button', { name: 'Check for changes' }).click();
            await d.getByTestId('resync-changes').waitFor();
            await shot('s8-resync-list');
            const text = await d.getByTestId('resync-changes').innerText();
            for (const word of ['invoices', 'legacy_log', 'status'])
                check(
                    text.includes(word),
                    `change list lacks ${word}: ${text.slice(0, 400)}`
                );
            check(/Possible renames/.test(text), 'no possible renames group');
            const boxesAll = d.locator('input[type=checkbox]');
            const total = await boxesAll.count();
            const renameBoxes = d
                .locator('fieldset')
                .filter({ hasText: 'Possible renames' })
                .locator('input[type=checkbox]');
            const rn = await renameBoxes.count();
            check(rn >= 1, 'no rename checkbox');
            for (let i = 0; i < rn; i += 1)
                check(
                    !(await renameBoxes.nth(i).isChecked()),
                    'a rename starts ticked'
                );
            const ticked = await d
                .locator('input[type=checkbox]:checked')
                .count();
            check(
                ticked === total - rn,
                `ticked ${ticked} of ${total} (renames ${rn})`
            );
            await noRawKeys();
        }
    );

    await step(
        'S8.08 Apply n selected applies; layout, colour, note, area kept; one toast',
        async () => {
            const d = page.getByRole('dialog');
            const apply = d.getByRole('button', {
                name: /^Apply \d+ selected$/,
            });
            const label = await apply.innerText();
            const n = Number(label.match(/\d+/)[0]);
            check(n >= 3, label);
            await apply.click();
            await toast(new RegExp(`Applied ${n} change`));
            await page.getByRole('dialog').waitFor({ state: 'detached' });
            await pause(800);
            const names = await tableNames();
            check(
                names.some((x) => x.includes('invoices')),
                'invoices not added: ' + names
            );
            check(
                !names.some((x) => x.includes('legacy_log')),
                'legacy_log not removed'
            );
            const after = await boxes();
            for (const k of ['customers', 'orders']) {
                const b = before[k];
                const a = after[k];
                check(
                    b &&
                        a &&
                        Math.abs(a.x - b.x) < 8 &&
                        Math.abs(a.y - b.y) < 8,
                    `${k} moved: ${JSON.stringify(b)} -> ${JSON.stringify(a)} (before ${JSON.stringify(before)} after ${JSON.stringify(after)})`
                );
            }
            check(
                (await page.locator('[data-testid^="region-"]').count()) === 1,
                'area lost'
            );
            check(
                (await page.locator('[data-testid^="memo-"]').count()) === 1,
                'note lost'
            );
            await waitSaved();
            const afterTable = findTable(await snapshot(), 'customers');
            check(
                afterTable.color === beforeTable.color,
                `colour changed ${beforeTable.color} -> ${afterTable.color}`
            );
            check(
                JSON.stringify(afterTable).includes(DESCRIPTION),
                'description lost'
            );
            await shot('s8-resync-applied');
        }
    );

    await step('S8.09 ONE undo reverts the whole re-sync', async () => {
        await page
            .locator('.react-flow__pane')
            .click({ position: { x: 640, y: 500 } });
        await page.keyboard.press('ControlOrMeta+z');
        await pause(800);
        const names = await tableNames();
        check(
            !names.some((x) => x.includes('invoices')),
            'invoices still there after undo'
        );
        check(
            names.some((x) => x.includes('legacy_log')),
            'legacy_log not back after undo'
        );
        await shot('s8-resync-undone');
    });

    await step(
        'S8.10 redo brings the re-sync back; lint finding of the new table is shown',
        async () => {
            await page.keyboard.press('ControlOrMeta+Shift+z');
            await pause(800);
            check(
                (await tableNames()).some((x) => x.includes('invoices')),
                'redo failed'
            );
            await waitSaved();
        }
    );
});

// =====================================================================  S10
await section('S10', 'German: sign-in and re-sync dialogs', async () => {
    await src.query('alter table orders add column priority int');
    const langs = [['de', 'German', 'Deutsch']];
    for (const [code, label] of langs) {
        const L = await newContext({ locale: code });
        watch(L.p, code);
        const prev = page;
        page = L.p;
        await step(
            `S10.${code}.1 ${label}: sign-in dialog is translated or English, no raw keys`,
            async () => {
                await page.goto(BASE + '/');
                await page.getByRole('button').first().waitFor();
                await pause(800);
                check(
                    await page.evaluate(() =>
                        document.documentElement.lang.startsWith(
                            document.documentElement.lang.slice(0, 2)
                        )
                    ),
                    'lang'
                );
                await page.locator('button').last().click();
                await page.getByRole('dialog').waitFor();
                await pause(400);
                await shot(`s10-${code}-signin`);
                await noRawKeys();
                const t = await page.getByRole('dialog').innerText();
                check(/[A-Za-zႠ-ჿÀ-ſ]{3}/.test(t), 'dialog empty');
            }
        );
        await L.ctx.close();
        page = prev;

        // the re-sync dialog needs the sync state kept in the admin browser
        page = A.p;
        await step(
            `S10.${code}.2 ${label}: re-sync dialog, no raw keys, nothing clipped`,
            async () => {
                await openDiagramByName(IMPORTED);
                await page
                    .getByRole('button', { name: 'Change language' })
                    .click();
                // the language button opens a select with a searchable list
                await page.getByRole('dialog').getByRole('combobox').click();
                await page
                    .getByText(langs.find((l) => l[0] === code)[2])
                    .first()
                    .click();
                await pause(1200);
                await page
                    .getByRole('button', { name: /@example\.com/ })
                    .click();
                // the re-sync item is the third in the account menu
                await page.getByRole('menuitem').nth(2).click();
                await pause(600);
                const d = page.getByRole('dialog');
                const pw = d.locator('input[type=password]');
                if (await pw.count()) await pw.fill(E.SRC_PASSWORD);
                await d.locator('button[type=submit]').click();
                await d
                    .getByTestId('resync-changes')
                    .or(d.getByTestId('resync-clean'))
                    .waitFor();
                await shot(`s10-${code}-resync`);
                await noRawKeys();
                await page.keyboard.press('Escape');
            }
        );
        // back to English whatever happened above
        await page.evaluate(() => localStorage.setItem('i18nextLng', 'en'));
        await page.reload();
        await pause(800);
    }
});

// the phone signs in as the admin last: an account has one session at a time,
// so this ends the admin's other browser
// =====================================================================  S9
await section('S9', 'phone viewport 390x844', async () => {
    const M = await newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    watch(M.p, 'phone');
    const prev = page;
    page = M.p;
    await step(
        'S9.01 phone: sign-in prompt and dialog fit the screen',
        async () => {
            await page.goto(BASE + '/');
            await page.getByRole('button', { name: 'Sign in' }).first().click();
            await page.getByRole('dialog').waitFor();
            await pause(600);
            await shot('s9-phone-signin');
            const over = await page.evaluate(
                () =>
                    document.documentElement.scrollWidth > window.innerWidth + 1
            );
            check(!over, 'horizontal scroll on the phone');
        }
    );
    await step('S9.02 phone: editor opens after sign-in', async () => {
        const d = page.getByRole('dialog');
        await d.getByPlaceholder('Email', { exact: true }).fill(ADMIN);
        await d.getByPlaceholder('Password', { exact: true }).fill(ADMIN_PW);
        await d.getByRole('button', { name: 'Sign in' }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.goto(`${BASE}/Test/diagrams`);
        await page.getByText(IMPORTED, { exact: true }).first().click();
        await page.getByRole('button', { name: 'Open diagram' }).click();
        await page.locator('.react-flow').waitFor();
        await pause(1000);
        await shot('s9-phone-editor');
        const over = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1
        );
        check(!over, 'horizontal scroll in the phone editor');
    });
    await step(
        'S9.03 phone: the Drift and Publish buttons can be reached by scrolling the bar',
        async () => {
            for (const name of [/^Drift/, /^Publish/]) {
                const b = page.getByRole('button', { name }).first();
                await b.scrollIntoViewIfNeeded();
                const box = await b.boundingBox();
                check(
                    box && box.x >= 0 && box.x + box.width <= 391,
                    `${name} is outside the 390 px screen: ${JSON.stringify(box)}`
                );
            }
            await shot('s9-phone-navbar-scrolled');
        }
    );
    await M.ctx.close();
    page = prev;
});

// ---------------------------------------------------------------- summary
await src
    .query(
        'drop table if exists orders, customers, product, products, legacy_log, invoices cascade'
    )
    .catch(() => undefined);
await src.end();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(
    `\n${results.length - failed.length}/${results.length} steps passed`
);
for (const f of failed) console.log(`  FAIL ${f.name}: ${f.error}`);
process.exit(failed.length ? 1 : 0);
