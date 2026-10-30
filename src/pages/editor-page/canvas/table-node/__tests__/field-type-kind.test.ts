import { describe, expect, it } from 'vitest';
import { fieldTypeKind } from '../field-type-kind';

describe('fieldTypeKind', () => {
    it.each([
        ['uuid', 'id'],
        ['UNIQUEIDENTIFIER', 'id'],
        ['boolean', 'bool'],
        ['bit', 'bool'],
        ['timestamptz', 'time'],
        ['timestamp with time zone', 'time'],
        ['interval', 'time'],
        ['jsonb', 'json'],
        ['integer', 'number'],
        ['bigint', 'number'],
        ['numeric(12,2)', 'number'],
        ['double precision', 'number'],
        ['datetimeoffset', 'time'],
        ['datetime64(3)', 'time'],
        ['date32', 'time'],
        ['uint8', 'number'],
        ['UInt256', 'number'],
        ['binary_double', 'number'],
        ['xmltype', 'json'],
        ['varchar', 'text'],
        ['point', 'text'],
        ['order_status', 'text'],
    ])('puts %s under %s', (name, kind) => {
        expect(fieldTypeKind(name)).toBe(kind);
    });
});
