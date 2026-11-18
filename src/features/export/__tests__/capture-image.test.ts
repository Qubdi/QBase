import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageOptions } from '@/formats/image/export-options';
import { JPEG_QUALITY, MAX_SIDE } from '@/formats/image/export-options';
import logoDark from '@/assets/qubdi-logo-dark.svg';
import logoLight from '@/assets/qubdi-logo-light.svg';
import {
    CaptureError,
    captureDiagram,
    measureNodes,
    settleRender,
    zoomOf,
} from '../capture-image';

const html = vi.hoisted(() => ({ toPng: vi.fn(), toSvg: vi.fn() }));
vi.mock('html-to-image', () => html);

const full = vi.hoisted(() => ({ release: vi.fn(), hold: vi.fn() }));
vi.mock('@/canvas/capture-mode', () => ({
    holdFullRender: () => {
        full.hold();
        return full.release;
    },
}));

const PICTURE = 'data:image/png;base64,picture';

/** Images load at once, except the sources listed in `broken`. */
const broken = new Set<string>();
class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 200;
    height = 50;
    private source = '';
    get src() {
        return this.source;
    }
    set src(value: string) {
        this.source = value;
        queueMicrotask(() =>
            broken.has(value) ? this.onerror?.() : this.onload?.()
        );
    }
}

/** A 2D context that records what was drawn. */
const fakeContext = () => ({
    fillStyle: '',
    globalAlpha: 1,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
});
let ctx: ReturnType<typeof fakeContext> | null;
let blobOut: Blob | null;
// the type and quality are only recorded
const toBlob = vi.fn<
    (done: (b: Blob | null) => void, type?: string, quality?: number) => void
>((done) => done(blobOut));

const realImage = globalThis.Image;
const realFetch = globalThis.fetch;
beforeEach(() => {
    broken.clear();
    ctx = fakeContext();
    blobOut = new Blob(['png'], { type: 'image/png' });
    html.toPng.mockReset().mockResolvedValue(PICTURE);
    html.toSvg.mockReset().mockResolvedValue('data:image/svg+xml,<svg/>');
    full.hold.mockReset();
    full.release.mockReset();
    toBlob.mockClear();
    globalThis.Image = FakeImage as never;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        () => ctx as never
    );
    HTMLCanvasElement.prototype.toBlob = toBlob as never;
    globalThis.fetch = vi.fn(async () => ({
        blob: async () => new Blob(['<svg/>'], { type: 'image/svg+xml' }),
    })) as never;
});
afterEach(() => {
    globalThis.Image = realImage;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
});

/** A surface like xyflow's, with nodes at diagram positions and the given zoom. */
const surface = (
    nodes: { x: number; y: number; w: number; h: number }[],
    zoom = 1
) => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="react-flow__viewport"></div>';
    const viewport = root.querySelector('.react-flow__viewport') as HTMLElement;
    viewport.style.transform = `translate(40px, 30px) scale(${zoom})`;
    viewport.getBoundingClientRect = () =>
        ({ left: 40, top: 30, width: 0, height: 0 }) as DOMRect;
    for (const n of nodes) {
        const el = document.createElement('div');
        el.className = 'react-flow__node';
        el.getBoundingClientRect = () =>
            ({
                left: 40 + n.x * zoom,
                top: 30 + n.y * zoom,
                width: n.w * zoom,
                height: n.h * zoom,
            }) as DOMRect;
        root.appendChild(el);
    }
    return { root, viewport };
};

const options = (o: Partial<ImageOptions> = {}): ImageOptions => ({
    format: 'png',
    scale: 2,
    pattern: false,
    transparent: false,
    theme: 'light',
    ...o,
});

const oneTable = () => surface([{ x: 0, y: 0, w: 100, h: 60 }]).root;

describe('zoomOf', () => {
    it('reads the zoom from a matrix or a scale', () => {
        expect(zoomOf('matrix(0.5, 0, 0, 0.5, 10, 20)')).toBe(0.5);
        expect(zoomOf('translate(1px, 2px) scale(2.25)')).toBe(2.25);
        expect(zoomOf('matrix(1e-1, 0, 0, 1, 0, 0)')).toBeCloseTo(0.1);
    });

    it('falls back to 1 for nothing, a zero or a negative zoom', () => {
        expect(zoomOf('')).toBe(1);
        expect(zoomOf('none')).toBe(1);
        expect(zoomOf('scale(0)')).toBe(1);
        expect(zoomOf('scale(-2)')).toBe(1);
    });
});

describe('measureNodes', () => {
    it('finds nothing without a viewport', () => {
        const root = document.createElement('div');
        root.innerHTML = '<div class="react-flow__node"></div>';
        expect(measureNodes(root)).toEqual([]);
    });

    it('undoes a zoom of 2', () => {
        const { root } = surface([{ x: 5, y: 7, w: 100, h: 40 }], 2);
        const [box] = measureNodes(root);
        expect(box.x).toBeCloseTo(5);
        expect(box.y).toBeCloseTo(7);
        expect(box.width).toBeCloseTo(100);
        expect(box.height).toBeCloseTo(40);
    });
});

describe('settleRender', () => {
    it('waits until the number of nodes stops changing', async () => {
        const root = document.createElement('div');
        let frames = 0;
        const raf = vi
            .spyOn(globalThis, 'requestAnimationFrame')
            .mockImplementation((cb) => {
                frames += 1;
                // a node appears on each of the first three frames
                if (frames <= 3) {
                    const el = document.createElement('div');
                    el.className = 'react-flow__node';
                    root.appendChild(el);
                }
                queueMicrotask(() => cb(0));
                return frames;
            });
        await settleRender(root);
        // three frames of growth, then three the same after the first steady count
        expect(frames).toBe(6);
        raf.mockRestore();
    });

    it('gives up after 60 frames on a surface that never settles', async () => {
        const root = document.createElement('div');
        let frames = 0;
        vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
            (cb) => {
                frames += 1;
                const el = document.createElement('div');
                el.className = 'react-flow__edge';
                root.appendChild(el);
                queueMicrotask(() => cb(0));
                return frames;
            }
        );
        await settleRender(root);
        expect(frames).toBe(60);
    });
});

describe('captureDiagram', () => {
    beforeEach(() => {
        // the frames of settleRender pass at once
        vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
            (cb) => {
                queueMicrotask(() => cb(0));
                return 0;
            }
        );
    });

    it('refuses a surface without a viewport, before asking for a full render', async () => {
        await expect(
            captureDiagram(document.createElement('div'), options())
        ).rejects.toMatchObject({ reason: 'no-canvas' });
        expect(full.hold).not.toHaveBeenCalled();
    });

    it('draws the whole diagram, with a margin, from its top left corner', async () => {
        const { root, viewport } = surface([
            { x: 100, y: 200, w: 300, h: 100 },
            { x: 500, y: 250, w: 100, h: 200 },
        ]);
        await captureDiagram(root, options({ scale: 1 }));
        expect(html.toPng).toHaveBeenCalledWith(
            viewport,
            expect.objectContaining({
                width: 600,
                height: 350,
                pixelRatio: 1,
                cacheBust: true,
                style: {
                    width: '600px',
                    height: '350px',
                    transform: 'translate(-50px, -150px) scale(1)',
                },
            })
        );
    });

    it('holds the full render while it captures and lets go when done', async () => {
        await captureDiagram(oneTable(), options());
        expect(full.hold).toHaveBeenCalledTimes(1);
        expect(full.release).toHaveBeenCalledTimes(1);
    });

    it('lets go of the full render when the capture fails too', async () => {
        html.toPng.mockRejectedValue(new Error('tainted canvas'));
        await expect(
            captureDiagram(oneTable(), options())
        ).rejects.toBeInstanceOf(CaptureError);
        expect(full.release).toHaveBeenCalledTimes(1);
    });

    it('PNG: fills the page colour, draws the picture and the light logo, and gives a PNG', async () => {
        const blob = await captureDiagram(oneTable(), options());
        expect(blob).toBe(blobOut);
        expect(ctx!.fillRect).toHaveBeenCalledTimes(1);
        expect(ctx!.arc).not.toHaveBeenCalled();
        const drawn = ctx!.drawImage.mock.calls.map(
            (c) => (c[0] as FakeImage).src
        );
        expect(drawn).toEqual([PICTURE, logoLight]);
        expect(toBlob.mock.calls[0][1]).toBe('image/png');
        // the logo is drawn see-through, then the alpha is put back
        expect(ctx!.globalAlpha).toBe(1);
    });

    it('PNG on the dark theme uses the dark logo', async () => {
        await captureDiagram(oneTable(), options({ theme: 'dark' }));
        expect((ctx!.drawImage.mock.calls[1][0] as FakeImage).src).toBe(
            logoDark
        );
    });

    it('a transparent PNG has no fill, and the dot pattern is drawn when asked', async () => {
        await captureDiagram(
            oneTable(),
            options({ transparent: true, pattern: true, scale: 1 })
        );
        expect(ctx!.fillRect).not.toHaveBeenCalled();
        expect(ctx!.arc).toHaveBeenCalled();
        expect(ctx!.fill).toHaveBeenCalledTimes(ctx!.arc.mock.calls.length);
    });

    it('JPEG is never transparent and uses the JPEG quality', async () => {
        await captureDiagram(
            oneTable(),
            options({ format: 'jpeg', transparent: true })
        );
        expect(ctx!.fillRect).toHaveBeenCalledTimes(1);
        expect(toBlob.mock.calls[0][1]).toBe('image/jpeg');
        expect(toBlob.mock.calls[0][2]).toBe(JPEG_QUALITY);
    });

    it('SVG comes straight from the vector capture, with no canvas and no logo', async () => {
        const blob = await captureDiagram(
            oneTable(),
            options({ format: 'svg', scale: 1 })
        );
        expect(blob.type).toBe('image/svg+xml');
        expect(html.toSvg).toHaveBeenCalledTimes(1);
        expect(html.toPng).not.toHaveBeenCalled();
        expect(ctx!.drawImage).not.toHaveBeenCalled();
    });

    it('lowers the ratio of a picture too large for a canvas and says so', async () => {
        const onLowered = vi.fn();
        const huge = surface([{ x: 0, y: 0, w: MAX_SIDE, h: 100 }]).root;
        await captureDiagram(huge, options({ scale: 4 }), { onLowered });
        expect(onLowered).toHaveBeenCalledTimes(1);
        const ratio = onLowered.mock.calls[0][0] as number;
        expect(ratio).toBeLessThan(1);
        expect(html.toPng.mock.calls[0][1].pixelRatio).toBe(ratio);
    });

    it('does not mention a lowered size for SVG, which has no pixel limit', async () => {
        const onLowered = vi.fn();
        const huge = surface([{ x: 0, y: 0, w: MAX_SIDE, h: 100 }]).root;
        await captureDiagram(huge, options({ format: 'svg', scale: 4 }), {
            onLowered,
        });
        expect(onLowered).not.toHaveBeenCalled();
    });

    it('a small picture at the asked scale is not reported as lowered', async () => {
        const onLowered = vi.fn();
        await captureDiagram(oneTable(), options({ scale: 4 }), { onLowered });
        expect(onLowered).not.toHaveBeenCalled();
    });

    it.each<[string, () => void, ImageOptions['format']?]>([
        [
            'the browser gives no 2D context',
            () => {
                ctx = null;
            },
        ],
        [
            'the captured picture cannot be loaded',
            () => {
                broken.add(PICTURE);
            },
        ],
        [
            'the canvas cannot be turned into a file',
            () => {
                blobOut = null;
            },
        ],
        [
            'the capture library throws',
            () => {
                html.toPng.mockRejectedValue(new Error('boom'));
            },
        ],
        [
            'the SVG cannot be read back',
            () => {
                globalThis.fetch = vi.fn(async () => {
                    throw new TypeError('network');
                }) as never;
            },
            'svg',
        ],
    ])('fails with "failed" when %s', async (_, breakIt, format = 'png') => {
        breakIt();
        await expect(
            captureDiagram(oneTable(), options({ format }))
        ).rejects.toMatchObject({ name: 'CaptureError', reason: 'failed' });
    });

    it('still gives the picture when the corner logo cannot be loaded', async () => {
        broken.add(logoLight);
        const blob = await captureDiagram(oneTable(), options());
        expect(blob).toBe(blobOut);
        expect(ctx!.drawImage).toHaveBeenCalledTimes(1);
    });
});
