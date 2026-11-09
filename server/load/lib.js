// Shared by the k6 scripts (runs inside k6, not Node).
import http from 'k6/http';
import { check, fail } from 'k6';

export const seed = JSON.parse(open('./.seed.json'));
export const BASE = __ENV.BASE_URL || seed.base;

/** Signs the virtual user in as its own account (the cookie jar keeps the session). */
export function signIn(user) {
    const res = http.post(
        `${BASE}/auth/login`,
        JSON.stringify({ email: user.email, password: seed.password }),
        { headers: { 'content-type': 'application/json' }, tags: { name: 'login' } }
    );
    if (!check(res, { 'login 200': (r) => r.status === 200 })) {
        fail(`login failed for ${user.email}: ${res.status} ${res.body}`);
    }
}

/** A virtual user's own account: users are never shared, one session per account. */
export const userFor = (vu) => seed.users[(vu - 1) % seed.users.length];

export const json = { headers: { 'content-type': 'application/json' } };
