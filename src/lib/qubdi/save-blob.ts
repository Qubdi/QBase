const REVOKE_AFTER_MS = 30_000;

/** Hands a file the browser already holds to the person, as a download. */
export const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // the click has started the download, but some browsers read the address
    // a moment later: freeing it at once can cancel the file
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
};

/** `2026-10-17`: the viewer's own date, for a file name. */
export const localDateStamp = (date = new Date()) =>
    [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
