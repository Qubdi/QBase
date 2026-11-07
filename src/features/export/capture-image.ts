import { toPng, toSvg } from 'html-to-image';
import {
    backgroundFill,
    diagramBounds,
    dotPattern,
    hasLogo,
    JPEG_QUALITY,
    logoPlacement,
} from '@/formats/image/export-options';
import type { ImageOptions, Rect } from '@/formats/image/export-options';
import logoDark from '@/assets/qubdi-logo-dark.svg';
import logoLight from '@/assets/qubdi-logo-light.svg';

/** The class names the diagram surface (xyflow) gives its parts. */
const VIEWPORT = '.react-flow__viewport';
const NODE = '.react-flow__node';

/** Largest side of the picture in pixels; browsers refuse canvases beyond about this. */
const MAX_SIDE = 16000;

export class CaptureError extends Error {
    constructor(readonly reason: 'no-canvas' | 'empty' | 'failed') {
        super(reason);
        this.name = 'CaptureError';
    }
}

/** The boxes of every node in diagram space, read from the page (zoom and pan undone). */
export function measureNodes(target: HTMLElement): Rect[] {
    const viewport = target.querySelector<HTMLElement>(VIEWPORT);
    if (!viewport) return [];
    const zoom =
        new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a || 1;
    const origin = viewport.getBoundingClientRect();
    return Array.from(target.querySelectorAll<HTMLElement>(NODE)).map((el) => {
        const r = el.getBoundingClientRect();
        return {
            x: (r.left - origin.left) / zoom,
            y: (r.top - origin.top) / zoom,
            width: r.width / zoom,
            height: r.height / zoom,
        };
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new CaptureError('failed'));
        img.src = src;
    });
}

export const nextFrame = () =>
    new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Draws the dots, the picture and (for PNG and JPEG) the corner logo into one canvas. */
async function compose(
    picture: string,
    size: { width: number; height: number },
    ratio: number,
    options: ImageOptions
): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(size.width * ratio);
    canvas.height = Math.ceil(size.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new CaptureError('failed');
    const fill = backgroundFill(options);
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (options.pattern) {
        const dots = dotPattern(options.theme);
        ctx.fillStyle = dots.colour;
        const step = dots.gap * ratio;
        for (let y = step / 2; y < canvas.height; y += step)
            for (let x = step / 2; x < canvas.width; x += step) {
                ctx.beginPath();
                ctx.arc(x, y, dots.radius * ratio, 0, Math.PI * 2);
                ctx.fill();
            }
    }
    ctx.drawImage(await loadImage(picture), 0, 0, canvas.width, canvas.height);
    if (hasLogo(options.format)) {
        const place = logoPlacement(canvas.width);
        try {
            const logo = await loadImage(
                options.theme === 'dark' ? logoDark : logoLight
            );
            const h = place.height;
            const w = (logo.width / (logo.height || 1)) * h;
            ctx.globalAlpha = place.opacity;
            ctx.drawImage(
                logo,
                place.margin,
                canvas.height - place.margin - h,
                w,
                h
            );
            ctx.globalAlpha = 1;
        } catch {
            // the picture is still good without its corner mark
        }
    }
    return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new CaptureError('failed'))),
            type,
            quality
        )
    );

/**
 * A picture of the whole diagram (EXP-064): the view is left alone, the nodes
 * are measured and the surface is drawn once at the size that holds them all.
 * The page's current theme decides the colours (EXP-063); a JPEG never has a
 * transparent background (EXP-065).
 */
export async function captureDiagram(
    target: HTMLElement | null,
    options: ImageOptions
): Promise<Blob> {
    const viewport = target?.querySelector<HTMLElement>(VIEWPORT);
    if (!target || !viewport) throw new CaptureError('no-canvas');
    const bounds = diagramBounds(measureNodes(target));
    if (!bounds) throw new CaptureError('empty');
    const size = {
        width: Math.ceil(bounds.width),
        height: Math.ceil(bounds.height),
    };
    const ratio = Math.min(
        options.scale,
        MAX_SIDE / Math.max(size.width, size.height)
    );
    const style = {
        width: `${size.width}px`,
        height: `${size.height}px`,
        transform: `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)`,
    };
    const shared = {
        width: size.width,
        height: size.height,
        style,
        pixelRatio: ratio,
        cacheBust: true,
    };
    try {
        if (options.format === 'svg') {
            const svg = await toSvg(viewport, shared);
            return await (await fetch(svg)).blob();
        }
        const picture = await toPng(viewport, shared);
        const canvas = await compose(picture, size, ratio, options);
        return options.format === 'jpeg'
            ? await toBlob(canvas, 'image/jpeg', JPEG_QUALITY)
            : await toBlob(canvas, 'image/png');
    } catch (error) {
        throw error instanceof CaptureError
            ? error
            : new CaptureError('failed');
    }
}
