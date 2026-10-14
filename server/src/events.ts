import { EventEmitter } from 'node:events';

/** In-process pub/sub used to push "new version" messages to open share viewers. */
const bus = new EventEmitter();
bus.setMaxListeners(0);

export type PublishListener = (diagramId: string, version: number) => void;
export type LinkListener = (linkId: string) => void;

export const emitPublish = (diagramId: string, version: number) =>
    bus.emit('publish', diagramId, version);
export const emitLinkChanged = (linkId: string) => bus.emit('link', linkId);

export const onPublish = (fn: PublishListener) => {
    bus.on('publish', fn);
    return () => bus.off('publish', fn);
};
export const onLinkChanged = (fn: LinkListener) => {
    bus.on('link', fn);
    return () => bus.off('link', fn);
};
