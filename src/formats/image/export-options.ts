// The pure part of image export. The DOM capture itself is Phase 6.
import { minBy, maxBy } from '@/core/model/extent';

export type ImageFormat = 'png' | 'jpeg' | 'svg';
export type ImageTheme = 'light' | 'dark';

export interface ImageOptions {
    format: ImageFormat;
    /** pixel ratio */
    scale: 1 | 2 | 4;
    /** draw the dot grid behind the diagram */
    pattern: boolean;
    transparent: boolean;
    theme: ImageTheme;
}

export const DEFAULT_IMAGE_OPTIONS: Omit<ImageOptions, 'format' | 'theme'> = {
    scale: 4,
    pattern: true,
    transparent: false,
};

export const IMAGE_EXTENSION: Record<ImageFormat, string> = {
    png: 'png',
    jpeg: 'jpeg',
    svg: 'svg',
};

export const JPEG_QUALITY = 1;

/** Largest side of a picture in pixels; browsers refuse canvases beyond about this. */
export const MAX_SIDE = 16000;
/** Largest area in pixels; iOS Safari stops at 16,777,216, so stay a little under. */
export const MAX_PIXELS = 16_000_000;

/**
 * The pixel ratio to draw at: the one asked for, lowered until the picture fits
 * both the side limit and the area limit of the canvas.
 */
export function exportRatio(
    size: { width: number; height: number },
    scale: number
): number {
    const side = MAX_SIDE / Math.max(size.width, size.height, 1);
    const area = Math.sqrt(MAX_PIXELS / Math.max(size.width * size.height, 1));
    return Math.min(scale, side, area);
}

/** `<diagram name>.<ext>` (EXP-060). */
export function imageFileName(
    diagramName: string,
    format: ImageFormat
): string {
    return `${diagramName}.${IMAGE_EXTENSION[format]}`;
}

const SURFACE: Record<ImageTheme, string> = {
    light: '#ffffff',
    dark: '#141414',
};
const DOTS: Record<ImageTheme, string> = { light: '#92939C', dark: '#777777' };

/**
 * Background fill (EXP-063, EXP-065): none for a transparent PNG or SVG; a
 * JPEG has no alpha, so it always gets the theme surface.
 */
export function backgroundFill(
    options: Pick<ImageOptions, 'format' | 'transparent' | 'theme'>
): string | undefined {
    if (options.transparent && options.format !== 'jpeg') return undefined;
    return SURFACE[options.theme];
}

export interface DotPattern {
    colour: string;
    /** distance between dots, in image pixels before the pixel ratio */
    gap: number;
    radius: number;
}

/** Dot grid at the given zoom: every 16 px, radius half a pixel, times zoom. */
export function dotPattern(theme: ImageTheme, zoom = 1): DotPattern {
    return { colour: DOTS[theme], gap: 16 * zoom, radius: 0.5 * zoom };
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The box that holds every rectangle, with a margin; undefined when there are none. */
export function diagramBounds(
    rects: readonly Rect[],
    margin = 50
): Rect | undefined {
    if (rects.length === 0) return undefined;
    const left = minBy(rects, (r) => r.x);
    const top = minBy(rects, (r) => r.y);
    const right = maxBy(rects, (r) => r.x + r.width);
    const bottom = maxBy(rects, (r) => r.y + r.height);
    return {
        x: left - margin,
        y: top - margin,
        width: right - left + 2 * margin,
        height: bottom - top + 2 * margin,
    };
}

/** Size of the file in pixels (EXP-061, EXP-064: the whole diagram is fitted). */
export function outputSize(
    bounds: Pick<Rect, 'width' | 'height'>,
    scale: number
): { width: number; height: number } {
    return {
        width: Math.ceil(bounds.width * scale),
        height: Math.ceil(bounds.height * scale),
    };
}

export interface LogoPlacement {
    height: number;
    margin: number;
    opacity: number;
}

/** The corner logo of PNG and JPEG (EXP-066); SVG has none. */
export function logoPlacement(imageWidth: number): LogoPlacement {
    const height = Math.max(24, imageWidth * 0.024);
    return { height, margin: Math.max(12, height / 2), opacity: 0.9 };
}

export const hasLogo = (format: ImageFormat): boolean => format !== 'svg';
