import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { openFailureOf } from '../open-failure';
import { i18n } from '@/i18n/i18n';
import { UnpublishedDiagramError } from '../open-remote';

// the screen's own wording, looked up, not the error's English text
const NOT_PUBLISHED = i18n.t('qubdi.workspace.diagramAccess.unpublished');

describe('openFailureOf', () => {
    it('tells a viewer a diagram with nothing published is not published yet', () => {
        expect(openFailureOf(new ApiError(404, 'not_published'))).toEqual({
            kind: 'failed',
            message: NOT_PUBLISHED,
        });
    });

    it('treats any other 404 as a missing diagram', () => {
        expect(openFailureOf(new ApiError(404, 'not_found'))).toEqual({
            kind: 'diagram_missing',
        });
    });

    it('keeps the unpublished message when the copy itself had no content', () => {
        expect(openFailureOf(new UnpublishedDiagramError())).toEqual({
            kind: 'failed',
            message: NOT_PUBLISHED,
        });
    });

    it('reports any other failure as it is', () => {
        const res = openFailureOf(new ApiError(500, 'internal_error'));
        expect(res.kind).toBe('failed');
        expect(res).not.toEqual({ kind: 'failed', message: NOT_PUBLISHED });
    });
});
