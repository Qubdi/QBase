// What an editor session looks like: open the diagram list, open a diagram,
// save it now and then, publish rarely, think in between. Each virtual user is
// one account working on its own diagram.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE, signIn, userFor, json } from './lib.js';

const VUS = Number(__ENV.VUS || 50);

export const options = {
    // the session cookie must survive from one iteration to the next
    noCookiesReset: true,
    scenarios: {
        editors: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { target: VUS, duration: '30s' },
                { target: VUS, duration: __ENV.DURATION || '2m' },
                { target: 0, duration: '15s' },
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        'http_req_duration{name:list}': ['p(95)<500'],
        'http_req_duration{name:open}': ['p(95)<800'],
        'http_req_duration{name:save}': ['p(95)<1000'],
        'http_req_duration{name:publish}': ['p(95)<1500'],
        checks: ['rate>0.99'],
    },
};

let me = null;
const editorId = `k6-${__VU}`;

export default function () {
    if (!me) {
        me = userFor(__VU);
        signIn(me);
    }

    const list = http.get(`${BASE}/diagrams`, { tags: { name: 'list' } });
    check(list, { 'list 200': (r) => r.status === 200 });
    sleep(Math.random() * 1.5 + 0.5);

    const open = http.get(`${BASE}/diagrams/${me.diagramId}`, { tags: { name: 'open' } });
    check(open, { 'open 200': (r) => r.status === 200 });
    if (open.status !== 200) return;
    const diagram = open.json();

    // the editor asks for the edit lock while a diagram is open
    http.post(`${BASE}/diagrams/${me.diagramId}/lock`, JSON.stringify({ editorId }), {
        ...json,
        tags: { name: 'lock' },
    });

    // a few saves per visit, each on the copy the last one returned
    let base = diagram.updatedAt;
    const saves = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < saves; i++) {
        sleep(Math.random() * 2 + 1);
        const content = diagram.content;
        content.tables[0].name = `renamed_${__ITER}_${i}`;
        const save = http.put(
            `${BASE}/diagrams/${me.diagramId}`,
            JSON.stringify({ content, baseUpdatedAt: base, editorId }),
            { ...json, tags: { name: 'save' } }
        );
        check(save, { 'save 200': (r) => r.status === 200 });
        if (save.status !== 200) break;
        base = save.json().updatedAt;
    }

    if (Math.random() < 0.1) {
        const pub = http.post(`${BASE}/diagrams/${me.diagramId}/publish`, '{}', {
            ...json,
            tags: { name: 'publish' },
        });
        check(pub, { 'publish 201': (r) => r.status === 201 });
    }
    sleep(Math.random() * 3 + 1);
}
