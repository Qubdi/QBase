import type { Design } from '@/core/model/design';
import {
    DEFAULT_IMAGE_OPTIONS,
    imageFileName,
} from '@/formats/image/export-options';
import type {
    ImageFormat,
    ImageOptions,
    ImageTheme,
} from '@/formats/image/export-options';
import { CaptureError, captureDiagram, nextFrame } from './capture-image';
import { downloadBlob, safeFileName } from './download-file';

export interface ImageExportRequest {
    format: ImageFormat;
    design: Pick<Design, 'name'>;
    theme: ImageTheme;
    getTarget: () => HTMLElement | null;
    /** called first: clears the selection so outlines are not drawn (EXP-067) */
    prepare?: () => void;
    /** the picture was made smaller than asked, at this pixel ratio */
    onLowered?: (ratio: number) => void;
    options?: Partial<Pick<ImageOptions, 'scale' | 'pattern' | 'transparent'>>;
}

/** The options of an SVG export from the menu: transparent, no dots, scale 1 (spec A6). */
export const SVG_QUICK_OPTIONS = {
    scale: 1,
    pattern: false,
    transparent: true,
} as const;

/** Captures the diagram and downloads it; throws CaptureError when it cannot. */
export async function runImageExport(
    request: ImageExportRequest
): Promise<void> {
    request.prepare?.();
    await nextFrame();
    await nextFrame();
    const options: ImageOptions = {
        ...DEFAULT_IMAGE_OPTIONS,
        ...(request.format === 'svg' ? SVG_QUICK_OPTIONS : {}),
        ...request.options,
        format: request.format,
        theme: request.theme,
    };
    const blob = await captureDiagram(request.getTarget(), options, {
        onLowered: request.onLowered,
    });
    downloadBlob(
        blob,
        safeFileName(imageFileName(request.design.name, request.format))
    );
}

export { CaptureError };
