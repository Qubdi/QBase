import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, errorMessage } from '../api';

const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

describe('qubdi api client', () => {
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
