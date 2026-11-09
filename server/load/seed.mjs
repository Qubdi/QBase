// Fills the load-test database and writes .seed.json for the k6 scripts and
// sse-fanout.mjs: an admin, one project, LOAD_USERS editors (a k6 virtual user
// needs an account of its own: signing in ends the account's older session)
// each with a diagram, and one published diagram with a live share link.
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const USERS = Number(process.env.LOAD_USERS ?? 200);
const TABLES = Number(process.env.LOAD_TABLES ?? 35);
const PASSWORD = 'Load-Test-Pass-1!';
const TEMP = 'Temp-Load-Pass-1!';
const ADMIN = 'admin@load.test';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { body, cookie } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: {
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...(cookie ? { cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    const setCookie = res.headers.get('set-cookie')?.split(';')[0] ?? null;
    return { status: res.status, json, cookie: setCookie };
}

async function ok(label, p) {
    const r = await p;
    if (r.status >= 300) {
        throw new Error(`${label}: ${r.status} ${JSON.stringify(r.json)}`);
    }
    return r;
}

export const content = (name, tables) => ({
    id: `load-${name}`,
    name,
    databaseType: 'postgresql',
    tables: Array.from({ length: tables }, (_, i) => ({
        id: `t${i}`,
        name: `table_${i}`,
        x: (i % 10) * 300,
        y: Math.floor(i / 10) * 400,
        columns: Array.from({ length: 8 }, (_, c) => ({
            id: `t${i}c${c}`,
            name: c === 0 ? 'id' : `column_${c}`,
            type: c === 0 ? 'uuid' : 'text',
            primaryKey: c === 0,
            nullable: c !== 0,
        })),
    })),
});

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            if ((await fetch(BASE + '/health')).ok) return;
        } catch {
            // not up yet
        }
        await sleep(1000);
    }
    throw new Error(`${BASE} did not come up`);
}

async function inBatches(items, size, fn) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    }
    return out;
}

await waitForServer();
console.log(`Seeding ${USERS} users, ${TABLES} tables per diagram on ${BASE}`);

const admin = await ok(
    'register admin',
    call('POST', '/auth/register', {
        body: { email: ADMIN, password: PASSWORD },
    })
);
const adminCookie = admin.cookie;
const project = (
    await ok(
        'project',
        call('POST', '/admin/projects', {
            cookie: adminCookie,
            body: { name: 'Load' },
        })
    )
).json;

const emails = Array.from(
    { length: USERS },
    (_, i) => `user${String(i + 1).padStart(4, '0')}@load.test`
);

// password hashing is the slow part: a few at a time
const created = await inBatches(emails, 8, async (email) => {
    const u = (
        await ok(
            `create ${email}`,
            call('POST', '/admin/users', {
                cookie: adminCookie,
                body: { email, password: TEMP },
            })
        )
    ).json;
    await ok(
        `member ${email}`,
        call('PUT', `/admin/projects/${project.id}/members/${u.id}`, {
            cookie: adminCookie,
            body: { role: 'editor' },
        })
    );
    // a password set by an admin must be replaced before anything else works
    const login = await ok(
        `login ${email}`,
        call('POST', '/auth/login', { body: { email, password: TEMP } })
    );
    await ok(
        `change password ${email}`,
        call('POST', '/auth/change-password', {
            cookie: login.cookie,
            body: { currentPassword: TEMP, newPassword: PASSWORD },
        })
    );
    // the password change ends this session; sign in again to create the diagram
    const again = await ok(
        `login ${email}`,
        call('POST', '/auth/login', { body: { email, password: PASSWORD } })
    );
    const d = (
        await ok(
            `diagram ${email}`,
            call('POST', '/diagrams', {
                cookie: again.cookie,
                body: {
                    title: `Diagram of ${email}`,
                    content: content(email, TABLES),
                    projectId: project.id,
                },
            })
        )
    ).json;
    return { email, id: u.id, diagramId: d.id };
});

// the diagram everybody reads through a share link
const hot = (
    await ok(
        'hot diagram',
        call('POST', '/diagrams', {
            cookie: adminCookie,
            body: {
                title: 'Shared',
                content: content('shared', TABLES),
                projectId: project.id,
            },
        })
    )
).json;
await ok('publish', call('POST', `/diagrams/${hot.id}/publish`, { cookie: adminCookie, body: {} }));
const link = (
    await ok(
        'share link',
        call('POST', `/diagrams/${hot.id}/share-links`, {
            cookie: adminCookie,
            body: { access: 'anyone', live: true },
        })
    )
).json;

writeFileSync(
    new URL('./.seed.json', import.meta.url),
    JSON.stringify(
        {
            base: BASE,
            password: PASSWORD,
            admin: { email: ADMIN, password: PASSWORD },
            projectId: project.id,
            users: created,
            hot: { diagramId: hot.id, token: link.token },
        },
        null,
        2
    )
);
console.log(`content size: ${TABLES} tables, ${(JSON.stringify(content('x', TABLES)).length / 1024).toFixed(0)} KB per diagram`);
console.log(`Done: .seed.json written (${created.length} users)`);
