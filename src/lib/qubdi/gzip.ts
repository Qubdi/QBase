/**
 * The text gzipped, or null when the browser cannot (no `CompressionStream`)
 * or the attempt fails. Callers fall back to sending the text as it is.
 */
export async function gzipText(text: string): Promise<Uint8Array | null> {
    if (typeof CompressionStream === 'undefined') return null;
    try {
        const stream = new CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        // written and read together: the compressor holds back its output until it is read
        const written = writer
            .write(new TextEncoder().encode(text))
            .then(() => writer.close());
        const packed = new Uint8Array(
            await new Response(stream.readable).arrayBuffer()
        );
        await written;
        return packed;
    } catch {
        return null;
    }
}
