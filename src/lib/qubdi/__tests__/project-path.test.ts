import { describe, expect, it } from 'vitest';
import { projectDiagramPath, projectHomePath } from '../project-path';

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
