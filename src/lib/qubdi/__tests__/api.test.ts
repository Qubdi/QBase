import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ApiError,
    createApi,
    errorMessage,
    KEEPALIVE_BODY_LIMIT,
    setSessionEndedHandler,
} from '../api';

const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

describe('qubdi api client', () => {
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

        it('drops keepalive for a body over the browser limit', async () => {
            const init = await run(
                { big: 'x'.repeat(KEEPALIVE_BODY_LIMIT) },
                { keepalive: true }
            );
            expect(init.keepalive).toBeUndefined();
        });
    });

    it('sends credentials and a JSON body', async () => {
        const fetchMock = vi.fn(async () =>
            jsonResponse(200, { id: '1', email: 'a@b.co', isAdmin: true })
        );
        const api = createApi(
            'http://srv',
            fetchMock as unknown as typeof fetch
        );
        const user = await api.login('a@b.co', 'password123');
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

    it('builds member URLs', async () => {
        const fetchMock = vi.fn(async () => jsonResponse(200, {}));
        const api = createApi(
            'http://srv',
            fetchMock as unknown as typeof fetch
        );
        await api.changeMemberRole('d1', 'u1', 'editor');
        const [url, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toBe('http://srv/diagrams/d1/members/u1');
        expect(init.method).toBe('PATCH');
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
});
