import { describe, expect, it } from 'vitest';
import { findRelationshipBetween } from '../db-relationship';

const rel = {
    sourceTableId: 'a',
    sourceFieldId: 'a1',
    targetTableId: 'b',
    targetFieldId: 'b1',
};

describe('findRelationshipBetween', () => {
    it('finds the same pair in either direction', () => {
        expect(findRelationshipBetween([rel], rel)).toBe(rel);
        expect(
            findRelationshipBetween([rel], {
                sourceTableId: 'b',
                sourceFieldId: 'b1',
                targetTableId: 'a',
                targetFieldId: 'a1',
            })
        ).toBe(rel);
    });

    it('does not mix up other fields of the same tables', () => {
        expect(
            findRelationshipBetween([rel], { ...rel, targetFieldId: 'b2' })
        ).toBeUndefined();
        expect(findRelationshipBetween([], rel)).toBeUndefined();
    });
});
