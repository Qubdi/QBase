import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ApiError,
    createApi,
    errorMessage,
    KEEPALIVE_BODY_LIMIT,
    setSessionEndedHandler,
    type RemoteUser,
    REQUEST_TIMEOUT_MS,
} from '../api';

const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

describe('qubdi api client', () => {
    describe('path ids', () => {
        it('encodes an id in every path it is put into', async () => {
            const hostile = 'a/../b?c#d';
            const urls: string[] = [];
            const fetchMock = vi.fn(async (url: string) => {
                urls.push(url);
                return jsonResponse(200, {});
            });
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            const methods = Object.values(api) as Array<
                (...args: unknown[]) => Promise<unknown>
            >;
            for (const method of methods) {
                if (typeof method !== 'function') continue;
                // a method that rejects the made-up arguments is not the point
                await Promise.resolve(
                    method(hostile, hostile, hostile, hostile)
                ).catch(() => undefined);
            }
            const withId = urls.filter((u) => u.includes('a%2F..%2Fb'));
            expect(withId.length).toBeGreaterThan(25);
            for (const url of urls) {
                expect(url).not.toContain('a/../b');
                expect(url).not.toContain('c#d');
            }
        });
    });

    describe('keepalive', () => {
        const run = async (
            content: Record<string, unknown>,
            options?: { keepalive?: boolean }
        ) => {
            const fetchMock = vi.fn(async () =>
                jsonResponse(200, { id: 'd1' })
            );
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            await api.updateDiagram('d1', { content }, options);
            return (
                fetchMock.mock.calls[0] as unknown as [string, RequestInit]
            )[1];
        };

        it('sets keepalive when asked and the body is small', async () => {
            const init = await run({ a: 1 }, { keepalive: true });
            expect(init.keepalive).toBe(true);
        });

        it('leaves keepalive off by default', async () => {
            const init = await run({ a: 1 });
            expect(init.keepalive).toBeUndefined();
        });

        it('counts bytes, not characters, against the limit', async () => {
            // 30,000 Georgian letters are 30,000 characters but 90,000 bytes
            const init = await run(
                { text: 'ა'.repeat(30_000) },
                { keepalive: true }
            );
            expect(init.keepalive).toBeUndefined();
        });

        it('drops keepalive for a body over the browser limit', async () => {
            const init = await run(
                { big: 'x'.repeat(KEEPALIVE_BODY_LIMIT) },
                { keepalive: true }
            );
            expect(init.keepalive).toBeUndefined();
        });
    });

    it('gives every request a timeout signal so a hung one cannot stall saving', async () => {
        const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
        const api = createApi(
            'http://srv',
            fetchMock as unknown as typeof fetch
        );
        await api.logout();
        const init = (
            fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        )[1];
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(init.signal?.aborted).toBe(false);
    });

    it('sends credentials and a JSON body', async () => {
        const fetchMock = vi.fn(async () =>
            jsonResponse(200, { id: '1', email: 'a@b.co', isAdmin: true })
        );
        const api = createApi(
            'http://srv',
            fetchMock as unknown as typeof fetch
        );
        const user = (await api.login('a@b.co', 'password123')) as RemoteUser;
        expect(user.email).toBe('a@b.co');
        const [url, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toBe('http://srv/auth/login');
        expect(init.method).toBe('POST');
        expect(init.credentials).toBe('include');
        expect(JSON.parse(init.body as string)).toEqual({
            email: 'a@b.co',
            password: 'password123',
        });
    });

    it('does not send a body or content-type on GET', async () => {
        const fetchMock = vi.fn(async () => jsonResponse(200, []));
        const api = createApi(
            'http://srv',
            fetchMock as unknown as typeof fetch
        );
        await api.listDiagrams();
        const [, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(init.body).toBeUndefined();
        expect(init.headers).toEqual({});
    });

    it('throws ApiError with status and code on failure', async () => {
        const api = createApi('http://srv', (async () =>
            jsonResponse(401, {
                error: 'invalid_credentials',
            })) as typeof fetch);
        await expect(api.login('a@b.co', 'x')).rejects.toMatchObject({
            status: 401,
            code: 'invalid_credentials',
        });
    });

    it('handles 204 responses', async () => {
        const api = createApi(
            'http://srv',
            (async () => new Response(null, { status: 204 })) as typeof fetch
        );
        await expect(api.deleteDiagram('id')).resolves.toBeUndefined();
    });

    describe('user management', () => {
        const call = async (
            request: (api: ReturnType<typeof createApi>) => Promise<unknown>,
            answer: unknown = {}
        ) => {
            const fetchMock = vi.fn(async () => jsonResponse(200, answer));
            await request(
                createApi('http://srv', fetchMock as unknown as typeof fetch)
            );
            const [url, init] = fetchMock.mock.calls[0] as unknown as [
                string,
                RequestInit,
            ];
            return { url, init };
        };

        it('sends a bulk action as one request with the action and the ids', async () => {
            const { url, init } = await call(
                (api) => api.adminBulkUsers('disable', ['u1', 'u2']),
                { changed: 2, unchanged: 0 }
            );
            expect(url).toBe('http://srv/admin/users/bulk');
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body as string)).toEqual({
                action: 'disable',
                ids: ['u1', 'u2'],
            });
        });

        it("reads a user's sessions", async () => {
            const { url, init } = await call(
                (api) => api.adminListUserSessions('u1'),
                []
            );
            expect(url).toBe('http://srv/admin/users/u1/sessions');
            expect(init.method).toBe('GET');
        });

        it('signs a user out everywhere with a DELETE on their sessions', async () => {
            const { url, init } = await call(
                (api) => api.adminSignOutUser('u1'),
                {
                    signedOut: 1,
                }
            );
            expect(url).toBe('http://srv/admin/users/u1/sessions');
            expect(init.method).toBe('DELETE');
        });

        it('explains what the server refused', () => {
            expect(
                errorMessage(new ApiError(400, 'cannot_sign_out_self'))
            ).toMatch(/sign yourself out/i);
            expect(
                errorMessage(new ApiError(400, 'cannot_delete_self'))
            ).toMatch(/delete your own/i);
        });
    });

    describe('activity', () => {
        const urlOf = async (
            params?: Parameters<
                ReturnType<typeof createApi>['adminListActivity']
            >[0]
        ) => {
            const fetchMock = vi.fn(async () =>
                jsonResponse(200, { items: [], nextCursor: null })
            );
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            await api.adminListActivity(params);
            return fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        };

        it('asks for a page with no filters as a plain URL', async () => {
            const [url, init] = await urlOf({ limit: 30 });
            expect(url).toBe('http://srv/admin/audit?limit=30');
            expect(init.method).toBe('GET');
        });

        it('sends the cursor and every filter that is set, and only those', async () => {
            const [url] = await urlOf({
                limit: 30,
                cursor: 'abc_-',
                group: 'sharing',
                userId: 'u1',
                diagramId: 'd1',
                from: '2026-10-01T00:00:00.000Z',
                to: '2026-10-02T23:59:59.999Z',
                saves: 'hide',
            });
            const query = new URL(url).searchParams;
            expect(Object.fromEntries(query)).toEqual({
                limit: '30',
                cursor: 'abc_-',
                group: 'sharing',
                userId: 'u1',
                diagramId: 'd1',
                from: '2026-10-01T00:00:00.000Z',
                to: '2026-10-02T23:59:59.999Z',
                saves: 'hide',
            });
        });

        it('leaves out an empty cursor, as on the first page', async () => {
            const [url] = await urlOf({ limit: 30, cursor: null });
            expect(new URL(url).searchParams.has('cursor')).toBe(false);
        });
    });

    describe('drift check', () => {
        const urlOf = async (options?: { cached?: boolean }) => {
            const fetchMock = vi.fn(async () => jsonResponse(200, {}));
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            await api.checkDrift('d1', options);
            const [url, init] = fetchMock.mock.calls[0] as unknown as [
                string,
                RequestInit,
            ];
            return { url, method: init.method };
        };

        it('reads the database when asked for a check', async () => {
            expect(await urlOf()).toEqual({
                url: 'http://srv/diagrams/d1/drift/check',
                method: 'POST',
            });
        });

        it('lets a recent report stand in when a diagram is opened', async () => {
            expect((await urlOf({ cached: true })).url).toBe(
                'http://srv/diagrams/d1/drift/check?cached=1'
            );
        });
    });

    describe('edit lock', () => {
        it('asks for the lock of a diagram on behalf of one editor', async () => {
            const fetchMock = vi.fn(async () =>
                jsonResponse(200, { held: false, holder: 'sam@corp.io' })
            );
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            await expect(api.acquireLock('d1', 'tab-1')).resolves.toEqual({
                held: false,
                holder: 'sam@corp.io',
            });
            const [url, init] = fetchMock.mock.calls[0] as unknown as [
                string,
                RequestInit,
            ];
            expect(url).toBe('http://srv/diagrams/d1/lock');
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body as string)).toEqual({
                editorId: 'tab-1',
            });
        });

        it('lets go of the lock, even as the page closes', async () => {
            const fetchMock = vi.fn(
                async () => new Response(null, { status: 204 })
            );
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            await api.releaseLock('d1', 'tab 1/2', { keepalive: true });
            const [url, init] = fetchMock.mock.calls[0] as unknown as [
                string,
                RequestInit,
            ];
            expect(url).toBe(
                'http://srv/diagrams/d1/lock?editorId=tab%201%2F2'
            );
            expect(init.method).toBe('DELETE');
            expect(init.keepalive).toBe(true);
        });

        it('says who is editing when a save is refused', () => {
            expect(
                errorMessage(
                    new ApiError(
                        423,
                        'locked',
                        'sam@corp.io is editing this diagram.'
                    )
                )
            ).toBe('sam@corp.io is editing this diagram.');
            expect(errorMessage(new ApiError(423, 'locked'))).toBe(
                'Someone else is editing this diagram.'
            );
        });
    });

    describe('saved connections', () => {
        it('updates one in place, leaving the password out when it is not changing', async () => {
            const fetchMock = vi.fn(async () =>
                jsonResponse(200, { id: 'c1' })
            );
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            await api.updateConnection('c1', {
                name: 'prod',
                dialect: 'postgresql',
                host: 'db.corp.io',
                database: 'shop',
                user: 'reader',
                ssl: false,
                trustServerCertificate: false,
            });
            const [url, init] = fetchMock.mock.calls[0] as unknown as [
                string,
                RequestInit,
            ];
            expect(url).toBe('http://srv/introspect/connections/c1');
            expect(init.method).toBe('PUT');
            expect(JSON.parse(init.body as string)).not.toHaveProperty(
                'password'
            );
        });

        it('asks the server whether it can store passwords', async () => {
            const fetchMock = vi.fn(async () =>
                jsonResponse(200, { savedConnections: false })
            );
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            await expect(api.introspectCapabilities()).resolves.toEqual({
                savedConnections: false,
            });
            expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
                'http://srv/introspect/capabilities'
            );
        });

        it('asks for a connection when a check has none', () => {
            expect(errorMessage(new ApiError(400, 'connection_required'))).toBe(
                'Choose a saved connection first.'
            );
        });
    });

    describe('a session that ended', () => {
        afterEach(() => setSessionEndedHandler(null));

        const apiAnswering = (status: number) =>
            createApi('http://srv', (async () =>
                jsonResponse(status, {
                    error: 'unauthorized',
                })) as typeof fetch);

        it('is reported when a signed-in request comes back as signed out', async () => {
            const ended = vi.fn();
            setSessionEndedHandler(ended);
            await expect(
                apiAnswering(401).listDiagrams()
            ).rejects.toMatchObject({ status: 401 });
            expect(ended).toHaveBeenCalledTimes(1);
        });

        it('is not reported for the sign-in calls, where 401 is an ordinary answer', async () => {
            const ended = vi.fn();
            setSessionEndedHandler(ended);
            await apiAnswering(401)
                .me()
                .catch(() => undefined);
            await apiAnswering(401)
                .login('a@b.co', 'x')
                .catch(() => undefined);
            expect(ended).not.toHaveBeenCalled();
        });

        it('is reported when the account calls come back signed out', async () => {
            const ended = vi.fn();
            setSessionEndedHandler(ended);
            await apiAnswering(401)
                .mfaStatus()
                .catch(() => undefined);
            await apiAnswering(401)
                .changePassword('old', 'new')
                .catch(() => undefined);
            expect(ended).toHaveBeenCalledTimes(2);
        });

        it('is not reported when the second sign-in step is refused', async () => {
            const ended = vi.fn();
            setSessionEndedHandler(ended);
            await apiAnswering(401)
                .loginMfa('ticket', { code: '123456' })
                .catch(() => undefined);
            expect(ended).not.toHaveBeenCalled();
        });

        it('is reported when the activity export comes back signed out', async () => {
            const ended = vi.fn();
            setSessionEndedHandler(ended);
            await expect(
                apiAnswering(401).adminExportActivity()
            ).rejects.toMatchObject({ status: 401 });
            expect(ended).toHaveBeenCalledTimes(1);
        });

        it('is not reported for other failures', async () => {
            const ended = vi.fn();
            setSessionEndedHandler(ended);
            await apiAnswering(403)
                .listDiagrams()
                .catch(() => undefined);
            await apiAnswering(500)
                .listDiagrams()
                .catch(() => undefined);
            expect(ended).not.toHaveBeenCalled();
        });
    });

    it('maps error codes to readable messages', () => {
        expect(errorMessage(new ApiError(401, 'invalid_credentials'))).toMatch(
            /wrong email or password/i
        );
        expect(errorMessage(new ApiError(500, 'something_new'))).toContain(
            'something_new'
        );
        expect(errorMessage(new TypeError('network'))).toMatch(/reach/i);
    });

    describe('adminExportActivity', () => {
        const csvResponse = (headers: Record<string, string> = {}) =>
            new Response('a,b\r\n', {
                status: 200,
                headers: { 'content-type': 'text/csv', ...headers },
            });

        it('asks for the filters, without a page or cursor, and sends the cookie', async () => {
            const fetchMock = vi.fn(async () => csvResponse());
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            await api.adminExportActivity({
                group: 'sharing',
                userId: 'u1',
                from: '2026-03-01T00:00:00.000Z',
                saves: 'hide',
            });
            const [url, init] = fetchMock.mock.calls[0] as unknown as [
                string,
                RequestInit,
            ];
            expect(url.startsWith('http://srv/admin/audit/export?')).toBe(true);
            const query = new URL(url).searchParams;
            expect(query.get('group')).toBe('sharing');
            expect(query.get('userId')).toBe('u1');
            expect(query.get('saves')).toBe('hide');
            expect(query.has('limit')).toBe(false);
            expect(query.has('cursor')).toBe(false);
            expect(init.credentials).toBe('include');
        });

        it('gives back the file with its row count and whether it was cut short', async () => {
            const fetchMock = vi.fn(async () =>
                csvResponse({ 'x-row-count': '50000', 'x-truncated': 'true' })
            );
            const api = createApi(
                'http://srv',
                fetchMock as unknown as typeof fetch
            );
            const result = await api.adminExportActivity();
            expect(result.rows).toBe(50000);
            expect(result.truncated).toBe(true);
            expect(await result.blob.text()).toBe('a,b\r\n');
        });

        it('treats missing headers as an uncut file of unknown size', async () => {
            const api = createApi('http://srv', (async () =>
                csvResponse()) as unknown as typeof fetch);
            const result = await api.adminExportActivity();
            expect(result.rows).toBe(0);
            expect(result.truncated).toBe(false);
        });

        it('throws the server error, not a file, when refused', async () => {
            const api = createApi('http://srv', (async () =>
                jsonResponse(404, {
                    error: 'not_found',
                })) as unknown as typeof fetch);
            await expect(api.adminExportActivity()).rejects.toMatchObject({
                status: 404,
                code: 'not_found',
            });
        });
    });
});

describe('getPublicShare', () => {
    it('gives up on a request that never answers instead of waiting forever', async () => {
        const controller = new AbortController();
        const timeout = vi
            .spyOn(AbortSignal, 'timeout')
            .mockReturnValue(controller.signal);
        try {
            const api = createApi(
                'http://srv',
                ((_url: string, init?: RequestInit) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () =>
                            reject(init.signal?.reason)
                        );
                    })) as typeof fetch
            );
            const pending = api.getPublicShare('tok');
            // the request was given the standard time limit...
            expect(timeout).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
            // ...and when it runs out the page gets an answer, not a hang
            controller.abort(new DOMException('timed out', 'TimeoutError'));
            await expect(pending).resolves.toEqual({ status: 'error' });
        } finally {
            timeout.mockRestore();
        }
    });
});

describe('listDiagrams', () => {
    it('asks for the diagrams of one project when given it', async () => {
        const fetchMock = vi.fn(async () => jsonResponse(200, []));
        const api = createApi(
            'http://srv',
            fetchMock as unknown as typeof fetch
        );
        await api.listDiagrams({ projectId: 'p1' });
        await api.listDiagrams();
        const urls = fetchMock.mock.calls.map((c) => (c as unknown[])[0]);
        expect(urls).toEqual([
            'http://srv/diagrams?projectId=p1',
            'http://srv/diagrams',
        ]);
    });
});

describe('getDiagramSummary', () => {
    it('reads one row from the summary route, not the whole list', async () => {
        const row = {
            id: 'r1',
            title: 'Shop',
            role: 'editor',
            projectId: 'p1',
        };
        const fetchMock = vi.fn(async () => jsonResponse(200, row));
        const api = createApi(
            'http://srv',
            fetchMock as unknown as typeof fetch
        );
        await expect(api.getDiagramSummary('r1')).resolves.toEqual(row);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toBe('http://srv/diagrams/r1/summary');
        expect(init.method).toBe('GET');
    });

    it('turns a 404 into an ApiError the gate can read as a missing diagram', async () => {
        const api = createApi('http://srv', (async () =>
            jsonResponse(404, { error: 'not_found' })) as typeof fetch);
        await expect(api.getDiagramSummary('gone')).rejects.toMatchObject({
            status: 404,
        });
    });
});
