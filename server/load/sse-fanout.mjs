// Opens VIEWERS live share viewers (server-sent events), publishes PUBLISHES
// times, and measures how long each viewer takes to hear about each version,
// then how long the re-read of the snapshot that every viewer does takes. k6
// cannot hold event streams open, so this part is plain Node.
import http from 'node:http';
import { readFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('./.seed.json', import.meta.url)));
const BASE = new URL(process.env.BASE_URL ?? seed.base);
const VIEWERS = Number(process.env.VIEWERS ?? 500);
const PUBLISHES = Number(process.env.PUBLISHES ?? 5);
const P95_LIMIT = Number(process.env.SSE_P95_MS ?? 2000);
const token = seed.hot.token;

const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });

const request = (method, path, { body, cookie } = {}) =>
    new Promise((resolve, reject) => {
        const req = http.request(
            { host: BASE.hostname, port: BASE.port, path, method, agent, headers: {
                ...(body ? { 'content-type': 'application/json' } : {}),
                ...(cookie ? { cookie } : {}),
            } },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
            }
        );
        req.on('error', reject);
        req.end(body ? JSON.stringify(body) : undefined);
    });

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const summary = (label, values) => {
    const s = [...values].sort((a, b) => a - b);
    return `${label.padEnd(26)} n=${String(s.length).padEnd(6)} p50=${pct(s, 0.5).toFixed(0)}ms  p95=${pct(s, 0.95).toFixed(0)}ms  max=${s[s.length - 1].toFixed(0)}ms`;
};

// state: when each version was published, and who has heard of it
const publishedAt = new Map();
// the version is only known once the publish call answers, but viewers can hear of it first
let pendingStart = 0;
const heard = new Map(); // version -> latencies
const reread = [];
const errors = [];
let opened = 0;

function openViewer() {
    return new Promise((resolve) => {
        const req = http.get(
            { host: BASE.hostname, port: BASE.port, path: `/s/${token}/events`, agent },
            (res) => {
                if (res.statusCode !== 200) {
                    errors.push(`open: ${res.statusCode}`);
                    res.resume();
                    return resolve();
                }
                opened++;
                resolve();
                let buf = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    buf += chunk;
                    let end;
                    while ((end = buf.indexOf('\n\n')) !== -1) {
                        const block = buf.slice(0, end);
                        buf = buf.slice(end + 2);
                        if (!block.startsWith('event: version')) continue;
                        const version = JSON.parse(block.split('data: ')[1]).version;
                        const t = performance.now();
                        if (!heard.has(version)) heard.set(version, []);
                        heard.get(version).push(t - (publishedAt.get(version) ?? pendingStart));
                        // a live viewer reads the new version straight away
                        request('GET', `/s/${token}`).then((r) => {
                            if (r.status === 200) reread.push(performance.now() - t);
                            else errors.push(`reread: ${r.status}`);
                        });
                    }
                });
                res.on('error', () => {});
            }
        );
        req.on('error', (e) => {
            errors.push(`open: ${e.message}`);
            resolve();
        });
    });
}

const login = await request('POST', '/auth/login', { body: seed.admin });
const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
if (!cookie) throw new Error(`admin login failed: ${login.status}`);

console.log(`Opening ${VIEWERS} live viewers on one link...`);
const t0 = performance.now();
for (let i = 0; i < VIEWERS; i += 100) {
    await Promise.all(
        Array.from({ length: Math.min(100, VIEWERS - i) }, openViewer)
    );
}
console.log(`  ${opened} open after ${(performance.now() - t0).toFixed(0)}ms`);

for (let n = 1; n <= PUBLISHES; n++) {
    const start = performance.now();
    pendingStart = start;
    const res = await request('POST', `/diagrams/${seed.hot.diagramId}/publish`, {
        cookie,
        body: {},
    });
    if (res.status !== 201) throw new Error(`publish: ${res.status} ${res.data}`);
    const version = JSON.parse(res.data).version;
    if (!heard.has(version)) heard.set(version, []);
    publishedAt.set(version, start);
    console.log(`  published v${version}, publish call took ${(performance.now() - start).toFixed(0)}ms`);
    await new Promise((r) => setTimeout(r, 4000));
}
await new Promise((r) => setTimeout(r, 2000));

console.log('');
let failed = false;
const all = [];
for (const [version, latencies] of heard) {
    console.log(summary(`v${version} heard`, latencies.length ? latencies : [0]));
    const missing = opened - latencies.length;
    if (missing > 0) {
        console.log(`  ${missing} of ${opened} viewers never heard of v${version}`);
        failed = true;
    }
    all.push(...latencies);
}
if (all.length) console.log(summary('all events', all));
if (reread.length) console.log(summary('snapshot re-read', reread));
if (errors.length) {
    console.log(`errors: ${errors.length} (first: ${errors[0]})`);
    failed = true;
}
if (all.length && pct([...all].sort((a, b) => a - b), 0.95) > P95_LIMIT) {
    console.log(`FAIL: p95 above ${P95_LIMIT}ms`);
    failed = true;
}
console.log(failed ? 'RESULT: FAIL' : 'RESULT: ok');
agent.destroy();
process.exit(failed ? 1 : 0);
