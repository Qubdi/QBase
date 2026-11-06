import { describe, expect, it } from 'vitest';
import { postgresSsl } from '../src/introspect/postgres.js';

const base = { ssl: true, trustServerCertificate: false };

describe('postgresSsl', () => {
    it('is off when TLS is off', () => {
        expect(postgresSsl({ ...base, ssl: false, host: 'db.example.com' })).toBe(false);
    });

    it('sends the hostname for SNI', () => {
        expect(postgresSsl({ ...base, host: 'db.example.com' })).toEqual({
            servername: 'db.example.com',
            rejectUnauthorized: true,
        });
    });

    it('sends no servername for an IP literal', () => {
        for (const host of ['10.0.0.5', '203.0.113.9', '2606:4700::1111']) {
            const ssl = postgresSsl({ ...base, host });
            expect(ssl).toEqual({ rejectUnauthorized: true });
            expect(ssl).not.toHaveProperty('servername');
        }
    });

    it('honours trustServerCertificate', () => {
        expect(
            postgresSsl({ ssl: true, trustServerCertificate: true, host: 'h.example' })
        ).toMatchObject({ rejectUnauthorized: false });
    });
});
