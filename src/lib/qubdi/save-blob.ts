/** Hands a file the browser already holds to the person, as a download. */
export const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // the click has started the download; the address is not needed after it
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** `2026-10-17`: the viewer's own date, for a file name. */
export const localDateStamp = (date = new Date()) =>
    [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
