import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { shop, withMemo } from './test/fixtures';
import { renderCanvas } from './test/render';

describe('note text safety', () => {
    // A note's text is written by any editor and shown to everyone who opens
    // the diagram, admins included, so markup in it must stay text.
    it('shows raw HTML in a note as plain text, not as elements', () => {
        const added = withMemo(
            shop().design,
            '<img src=x onerror="alert(1)"><script>alert(2)</script>'
        );
        renderCanvas(added.design);
        const card = screen.getByTestId(`memo-${added.memoId}`);
        expect(card.querySelector('img, script')).toBeNull();
        expect(card).toHaveTextContent('<img src=x onerror="alert(1)">');
    });
});
