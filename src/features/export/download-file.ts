/** Hands a text or binary result to the browser as a file download. */
export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // the click starts the download synchronously; the address can go afterwards
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(
    text: string,
    fileName: string,
    type: string
): void {
    downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), fileName);
}

/** Characters a file name cannot hold on common systems are replaced. */
export const safeFileName = (name: string): string =>
    Array.from(name, (c) =>
        c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? '_' : c
    )
        .join('')
        .trim() || 'diagram';
