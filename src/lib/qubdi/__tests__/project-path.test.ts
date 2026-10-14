import { describe, expect, it } from 'vitest';
import {
    findProjectBySlug,
    projectDiagramPath,
    projectHomePath,
} from '../project-path';

describe('project paths', () => {
    it('builds the workspace and diagram URLs', () => {
        expect(projectHomePath('Qubdi')).toBe('/Qubdi/diagrams');
        expect(projectDiagramPath('Merme', 'abc-123')).toBe(
            '/Merme/diagrams/abc-123'
        );
    });

    it('encodes slugs that are not plain ASCII', () => {
        expect(projectHomePath('მერმე')).toBe(
            `/${encodeURIComponent('მერმე')}/diagrams`
        );
    });
});

describe('findProjectBySlug', () => {
    const projects = [
        { id: '1', slug: 'Qubdi' },
        { id: '2', slug: 'Merme' },
        { id: '3', slug: 'მერმე' },
    ];

    it('matches ignoring case', () => {
        expect(findProjectBySlug(projects, 'qubdi')?.id).toBe('1');
        expect(findProjectBySlug(projects, 'MERME')?.id).toBe('2');
    });

    it('accepts an encoded or decoded slug', () => {
        expect(
            findProjectBySlug(projects, encodeURIComponent('მერმე'))?.id
        ).toBe('3');
        expect(findProjectBySlug(projects, 'მერმე')?.id).toBe('3');
    });

    it('returns nothing for unknown, empty or malformed slugs', () => {
        expect(findProjectBySlug(projects, 'nope')).toBeUndefined();
        expect(findProjectBySlug(projects, '')).toBeUndefined();
        expect(findProjectBySlug(projects, undefined)).toBeUndefined();
        expect(findProjectBySlug(projects, '%E0%A4%A')).toBeUndefined();
    });
});
