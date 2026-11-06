import { describe, expect, it } from 'vitest';
import {
    DEFAULT_IMAGE_OPTIONS,
    backgroundFill,
    diagramBounds,
    dotPattern,
    hasLogo,
    imageFileName,
    logoPlacement,
    outputSize,
} from './export-options';

describe('EXP-060 to EXP-066 image export options', () => {
    it('EXP-060 file names', () => {
        expect(imageFileName('Shop', 'png')).toBe('Shop.png');
        expect(imageFileName('Shop', 'jpeg')).toBe('Shop.jpeg');
        expect(imageFileName('Shop', 'svg')).toBe('Shop.svg');
    });
    it('EXP-061 EXP-062 defaults', () => {
        expect(DEFAULT_IMAGE_OPTIONS).toEqual({
            scale: 4,
            pattern: true,
            transparent: false,
        });
    });
    it('EXP-063 theme colours', () => {
        expect(
            backgroundFill({
                format: 'png',
                transparent: false,
                theme: 'light',
            })
        ).toBe('#ffffff');
        expect(
            backgroundFill({ format: 'png', transparent: false, theme: 'dark' })
        ).toBe('#141414');
        expect(dotPattern('light').colour).toBe('#92939C');
        expect(dotPattern('dark', 2)).toEqual({
            colour: '#777777',
            gap: 32,
            radius: 1,
        });
    });
    it('EXP-065 transparent JPEG uses the theme surface, PNG and SVG stay clear', () => {
        expect(
            backgroundFill({ format: 'jpeg', transparent: true, theme: 'dark' })
        ).toBe('#141414');
        expect(
            backgroundFill({ format: 'png', transparent: true, theme: 'dark' })
        ).toBeUndefined();
        expect(
            backgroundFill({ format: 'svg', transparent: true, theme: 'light' })
        ).toBeUndefined();
    });
    it('EXP-064 bounds fit the whole diagram', () => {
        const b = diagramBounds([
            { x: 0, y: 0, width: 200, height: 100 },
            { x: 500, y: 300, width: 200, height: 100 },
        ])!;
        expect(b).toEqual({ x: -50, y: -50, width: 800, height: 500 });
        expect(outputSize(b, 2)).toEqual({ width: 1600, height: 1000 });
        expect(diagramBounds([])).toBeUndefined();
    });
    it('EXP-066 logo size and placement', () => {
        expect(logoPlacement(1000)).toEqual({
            height: 24,
            margin: 12,
            opacity: 0.9,
        });
        expect(logoPlacement(4000).height).toBeCloseTo(96);
        expect(hasLogo('svg')).toBe(false);
        expect(hasLogo('png')).toBe(true);
    });
});
