// The public read of a share link by anonymous viewers: the hottest unauthenticated
// path, served from the snapshot cache when many arrive together.
import http from 'k6/http';
import { check } from 'k6';
import { seed, BASE } from './lib.js';

const VUS = Number(__ENV.VUS || 100);

export const options = {
    scenarios: {
        viewers: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { target: VUS, duration: '20s' },
                { target: VUS, duration: __ENV.DURATION || '1m' },
                { target: 0, duration: '10s' },
            ],
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.001'],
        http_req_duration: ['p(95)<300', 'p(99)<800'],
    },
};

export default function () {
    const res = http.get(`${BASE}/s/${seed.hot.token}`, { tags: { name: 'share' } });
    check(res, { 'share 200': (r) => r.status === 200 });
}
