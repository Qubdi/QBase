import { toPng, toSvg } from 'html-to-image';
import {
    backgroundFill,
    diagramBounds,
    exportRatio,
    dotPattern,
    hasLogo,
    JPEG_QUALITY,
    logoPlacement,
} from '@/formats/image/export-options';
import type { ImageOptions, Rect } from '@/formats/image/export-options';
import { holdFullRender } from '@/canvas/capture-mode';
import logoDark from '@/assets/qubdi-logo-dark.svg';
import logoLight from '@/assets/qubdi-logo-light.svg';

/** The class names the diagram surface (xyflow) gives its parts. */
const VIEWPORT = '.react-flow__viewport';
const NODE = '.react-flow__node';

/** Things the person should hear about while the picture is made. */
export interface CaptureNotes {
    /** the size was lowered to a ratio that the browser's canvas can hold */
    onLowered?(ratio: number): void;
}

export class CaptureError extends Error {
    constructor(readonly reason: 'no-canvas' | 'empty' | 'failed') {
        super(reason);
        this.name = 'CaptureError';
    }
}

/** The zoom in a CSS transform: `matrix(a, ...)` as browsers report it, or `scale(n)`. */
export function zoomOf(transform: string): number {
    const matrix = /matrix\(\s*(-?[\d.e+-]+)/.exec(transform);
    const scale = /scale\(\s*(-?[\d.e+-]+)/.exec(transform);
    const value = Number(matrix?.[1] ?? scale?.[1]);
    return Number.isFinite(value) && value > 0 ? value : 1;
}

/** The boxes of every node in diagram space, read from the page (zoom and pan undone). */
export function measureNodes(target: HTMLElement): Rect[] {
    const viewport = target.querySelector<HTMLElement>(VIEWPORT);
    if (!viewport) return [];
    const zoom = zoomOf(
        getComputedStyle(viewport).transform || viewport.style.transform
    );
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

/**
 * Waits until the surface has drawn everything: two frames at least, then until
 * the number of nodes and lines stays the same for three frames.
 */
export async function settleRender(target: HTMLElement): Promise<void> {
    const count = () =>
        target.querySelectorAll(`${NODE}, .react-flow__edge`).length;
    let last = -1;
    let same = 0;
    for (let frame = 0; frame < 60 && same < 3; frame++) {
        await nextFrame();
        const now = count();
        same = now === last ? same + 1 : 0;
        last = now;
    }
}

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
    options: ImageOptions,
    notes?: CaptureNotes
): Promise<Blob> {
    const viewport = target?.querySelector<HTMLElement>(VIEWPORT);
    if (!target || !viewport) throw new CaptureError('no-canvas');
    // the surface skips what is outside the window: draw all of it meanwhile
    const release = holdFullRender();
    try {
        await settleRender(target);
        return await capture(target, viewport, options, notes);
    } finally {
        release();
    }
}

async function capture(
    target: HTMLElement,
    viewport: HTMLElement,
    options: ImageOptions,
    notes?: CaptureNotes
): Promise<Blob> {
    const bounds = diagramBounds(measureNodes(target));
    if (!bounds) throw new CaptureError('empty');
    const size = {
        width: Math.ceil(bounds.width),
        height: Math.ceil(bounds.height),
    };
    const ratio = exportRatio(size, options.scale);
    if (options.format !== 'svg' && ratio < options.scale)
        notes?.onLowered?.(ratio);
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
