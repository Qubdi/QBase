// Many sign-ins per second. Hashing a password is the heaviest thing the server
// does, so this finds how many logins it absorbs before everything else slows.
// A second scenario pings /health the whole time: if its latency climbs, the
// hashing is starving the rest of the server.
import http from 'k6/http';
import { check } from 'k6';
import { seed, BASE, json } from './lib.js';

const RATE = Number(__ENV.RATE || 100);

export const options = {
    scenarios: {
        logins: {
            executor: 'ramping-arrival-rate',
            exec: 'login',
            startRate: 1,
            timeUnit: '1s',
            preAllocatedVUs: 50,
            maxVUs: 500,
            stages: [
                { target: RATE, duration: '30s' },
                { target: RATE, duration: __ENV.DURATION || '2m' },
                { target: 0, duration: '10s' },
            ],
        },
        health: {
            executor: 'constant-arrival-rate',
            exec: 'health',
            rate: 10,
            timeUnit: '1s',
            duration: '100s',
            preAllocatedVUs: 5,
            maxVUs: 20,
        },
    },
    thresholds: {
        'http_req_failed{name:login}': ['rate<0.01'],
        'http_req_duration{name:login}': ['p(95)<1500'],
        // the rest of the server must stay responsive while logins hash
        'http_req_duration{name:health}': ['p(95)<200'],
    },
};

export function login() {
    // each iteration takes the next account: one session per account, so two
    // overlapping sign-ins of the same one would be a different test
    const user = seed.users[(__ITER * 997 + __VU) % seed.users.length];
    const res = http.post(
        `${BASE}/auth/login`,
        JSON.stringify({ email: user.email, password: seed.password }),
        { ...json, tags: { name: 'login' } }
    );
    check(res, { 'login 200': (r) => r.status === 200 });
}

export function health() {
    http.get(`${BASE}/health`, { tags: { name: 'health' } });
}
