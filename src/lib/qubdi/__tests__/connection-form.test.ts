import { describe, expect, it } from 'vitest';
import type { SavedConnection } from '../api';
import {
    DEFAULT_PORT,
    describeConnection,
    emptyConnectionForm,
    formFromConnection,
    formToConnection,
} from '../connection-form';

const saved: SavedConnection = {
    id: 'c1',
    name: 'prod replica',
    dialect: 'sqlserver',
    host: 'db.corp.io',
    port: 14333,
    database: 'shop',
    user: 'reader',
    ssl: true,
    trustServerCertificate: true,
    createdAt: '2026-01-01T00:00:00.000Z',
};

describe('connection form', () => {
    it('starts as PostgreSQL on its usual port', () => {
        expect(emptyConnectionForm()).toMatchObject({
            dialect: 'postgresql',
            port: DEFAULT_PORT.postgresql,
            password: '',
            ssl: true,
        });
    });

    it("knows each dialect's usual port", () => {
        expect(DEFAULT_PORT).toEqual({ postgresql: '5432', sqlserver: '1433' });
    });

    it('fills in from a saved connection, never with its password', () => {
        expect(formFromConnection(saved)).toEqual({
            name: 'prod replica',
            dialect: 'sqlserver',
            host: 'db.corp.io',
            port: '14333',
            database: 'shop',
            user: 'reader',
            password: '',
            ssl: true,
            trustServerCertificate: true,
        });
    });

    it('turns into the fields the server takes, trimmed', () => {
        expect(
            formToConnection({
                ...emptyConnectionForm(),
                host: '  db.corp.io ',
                port: '5433',
                database: ' shop ',
                user: ' reader ',
                password: ' keep the spaces ',
            })
        ).toEqual({
            dialect: 'postgresql',
            host: 'db.corp.io',
            port: 5433,
            database: 'shop',
            user: 'reader',
            password: ' keep the spaces ',
            ssl: true,
            trustServerCertificate: false,
        });
    });

    it('leaves the port to the server when it is blank or not a number', () => {
        expect(
            formToConnection({ ...emptyConnectionForm(), port: '' }).port
        ).toBeUndefined();
        expect(
            formToConnection({ ...emptyConnectionForm(), port: 'abc' }).port
        ).toBeUndefined();
    });

    it('describes where a connection points', () => {
        expect(describeConnection(saved)).toBe(
            'SQL Server · db.corp.io:14333/shop · reader'
        );
    });
});
